package com.musicstory.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.musicstory.app.data.local.AppDatabase
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.local.StoryOfflineAudioStore
import com.musicstory.app.data.remote.AccountAuthManager
import com.musicstory.app.data.remote.AccountSyncManager
import com.musicstory.app.data.remote.ApiClient
import com.musicstory.app.data.remote.BackendAuthManager
import com.musicstory.app.data.remote.MetadataCache
import com.musicstory.app.data.remote.MetadataEnricher
import com.musicstory.app.data.repository.ScrobbleRepository
import com.musicstory.app.data.repository.StoryRepository
import com.musicstory.app.domain.MonitorLifecycle
import com.musicstory.app.domain.OfflinePackNotifier
import com.musicstory.app.domain.OfflinePackRepository
import com.musicstory.app.domain.StoryOrchestrator
import com.musicstory.app.domain.StoryPlayer
import com.musicstory.app.domain.TriggerEngine
import com.musicstory.app.media.MediaControllerManager
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.musicstory.app.domain.WelcomeTrialGate
import com.musicstory.app.worker.AuthRefreshWorker
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import com.musicstory.app.data.local.toCached
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class MusicStoryApp : Application() {

    lateinit var settingsDataStore: SettingsDataStore
        private set

    lateinit var backendAuthManager: BackendAuthManager
        private set

    lateinit var apiClient: ApiClient
        private set

    lateinit var accountSyncManager: AccountSyncManager
        private set

    lateinit var accountAuthManager: AccountAuthManager
        private set

    lateinit var scrobbleRepository: ScrobbleRepository
        private set

    lateinit var storyRepository: StoryRepository
        private set

    lateinit var mediaControllerManager: MediaControllerManager
        private set

    lateinit var storyPlayer: StoryPlayer
        private set

    lateinit var triggerEngine: TriggerEngine
        private set

    lateinit var monitorLifecycle: MonitorLifecycle
        private set

    lateinit var storyOrchestrator: StoryOrchestrator
        private set

    lateinit var offlinePackRepository: OfflinePackRepository
        private set

    lateinit var playBillingManager: com.musicstory.app.billing.PlayBillingManager
        private set

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        installCrashLogger()
        instance = this

        createNotificationChannels()

        val database = AppDatabase.getInstance(this)
        settingsDataStore = SettingsDataStore(this)
        backendAuthManager = BackendAuthManager(this, settingsDataStore)
        apiClient = ApiClient(backendAuthManager)
        accountSyncManager = AccountSyncManager(backendAuthManager)
        settingsDataStore.setCloudSyncHook {
            syncSettingsWithServer()
        }
        accountAuthManager = AccountAuthManager(backendAuthManager)
        scrobbleRepository = ScrobbleRepository(
            scrobbleDao = database.scrobbleDao(),
            accountSyncManager = accountSyncManager,
            settingsDataStore = settingsDataStore,
        )
        val metadataEnricher = MetadataEnricher()
        val metadataCache = MetadataCache(metadataEnricher)
        val offlineAudioStore = StoryOfflineAudioStore(this)
        storyRepository = StoryRepository(
            storyDao = database.storyDao(),
            storyHistoryDao = database.storyHistoryDao(),
            settingsDataStore = settingsDataStore,
            apiClient = apiClient,
            accountSyncManager = accountSyncManager,
            metadataCache = metadataCache,
            offlineAudioStore = offlineAudioStore,
            offlinePackDao = database.offlinePackDao(),
        )
        offlinePackRepository = OfflinePackRepository(
            context = this,
            offlinePackDao = database.offlinePackDao(),
            settingsDataStore = settingsDataStore,
            storyRepository = storyRepository,
            notifier = OfflinePackNotifier(this),
        )
        playBillingManager = com.musicstory.app.billing.PlayBillingManager(this)
        mediaControllerManager = MediaControllerManager(this)
        storyPlayer = StoryPlayer(this)
        triggerEngine = TriggerEngine()
        storyOrchestrator = StoryOrchestrator(
            context = applicationContext,
            storyRepository = storyRepository,
            scrobbleRepository = scrobbleRepository,
            settingsDataStore = settingsDataStore,
            mediaControllerManager = mediaControllerManager,
            storyPlayer = storyPlayer,
            triggerEngine = triggerEngine,
        )
        monitorLifecycle = MonitorLifecycle(
            context = this,
            settingsDataStore = settingsDataStore,
            mediaControllerManager = mediaControllerManager,
            storyOrchestrator = storyOrchestrator,
            scope = appScope,
        )
        scheduleBackgroundAuthRefresh()
        prefetchBackendAuth()
        WelcomeTrialGate.ensureDeviceWelcomeTrial(this)
        prefetchAccountHistory()
        appScope.launch {
            storyRepository.dedupeStoryHistory()
        }
        appScope.launch {
            val purgeMarker = settingsDataStore.offlineCachePurgeVersion.first()
            if (purgeMarker < BuildConfig.VERSION_CODE) {
                storyRepository.purgeOfflinePlaybackCache()
                settingsDataStore.setOfflineCachePurgeVersion(BuildConfig.VERSION_CODE)
            }
        }
        appScope.launch {
            offlinePackRepository.refreshState()
        }
        appScope.launch {
            delay(8_000)
            storyRepository.prefetchMissingOfflineAudio()
        }
    }

    private fun prefetchAccountHistory() {
        appScope.launch {
            // Let OEM security scanners finish before network + account sync (Huawei/MIUI after login).
            delay(4_000)
            val backendUrl = settingsDataStore.backendUrl.first().trim()
            if (backendUrl.isBlank()) return@launch
            val login = accountAuthManager.fetchProfileWithCloud(backendUrl)
            val profile = login.profile ?: return@launch
            if (!profile.isLoggedIn) return@launch
            settingsDataStore.setAccountLinked(true)
            settingsDataStore.saveAccountProfile(profile.toCached())
            if (!settingsDataStore.homeTourCompleted.first()) {
                settingsDataStore.setHomeTourPending(true)
            }
            if (login.history.isNotEmpty()) {
                storyRepository.mergeHistoryEntries(login.history)
            }
            if (login.scrobbles.isNotEmpty()) {
                scrobbleRepository.mergeScrobbleEntries(login.scrobbles)
            }
            storyRepository.dedupeStoryHistory()
            syncAccountDataWithServer(backendUrl)
            storyRepository.dedupeStoryHistory()
        }
    }

    suspend fun syncAccountDataWithServer(baseUrl: String) {
        val url = baseUrl.trim()
        if (url.isBlank()) return
        syncSettingsWithServer(url)
        storyRepository.syncAccountDataWithServer(url)
        scrobbleRepository.syncAccountDataWithServer(url)
    }

    /** Pull cloud settings down, merge if newer, then push local snapshot. */
    suspend fun syncSettingsWithServer() {
        syncSettingsWithServer(settingsDataStore.backendUrl.first().trim())
    }

    suspend fun syncSettingsWithServer(baseUrl: String) {
        val url = baseUrl.trim()
        if (url.isBlank()) return
        if (!settingsDataStore.accountLinked.first()) return
        val syncCode = settingsDataStore.syncCode.first()
        if (!accountSyncManager.ensureSyncRegistered(url, syncCode) { settingsDataStore.setSyncCode(it) }) {
            return
        }
        accountSyncManager.pullSettings(url)?.let { remote ->
            settingsDataStore.applyRemoteSettings(remote)
        }
        val payload = settingsDataStore.buildSyncPayload()
        accountSyncManager.pushSettings(url, payload)
        settingsDataStore.markSettingsSynced(payload.updatedAt)
    }

    private fun prefetchBackendAuth() {
        appScope.launch {
            val backendUrl = settingsDataStore.backendUrl.first()
            backendAuthManager.warmUp(backendUrl)
        }
    }

    private fun scheduleBackgroundAuthRefresh() {
        try {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = PeriodicWorkRequestBuilder<AuthRefreshWorker>(3, TimeUnit.DAYS)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                AUTH_REFRESH_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        } catch (e: Exception) {
            StoryLog.w("WorkManager schedule skipped: ${e.message}", e)
        }
    }

    override fun onTerminate() {
        storyPlayer.release()
        super.onTerminate()
    }

    private fun installCrashLogger() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            StoryLog.e("FATAL uncaught on ${thread.name}", throwable)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val monitorChannel = NotificationChannel(
            CHANNEL_MONITOR,
            getString(R.string.channel_monitor_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.channel_monitor_description)
        }
        manager.createNotificationChannel(monitorChannel)
    }

    companion object {
        const val CHANNEL_MONITOR = "monitor"
        private const val AUTH_REFRESH_WORK = "backend_auth_refresh"

        @Volatile
        private var instance: MusicStoryApp? = null

        fun get(): MusicStoryApp = instance
            ?: throw IllegalStateException("MusicStoryApp not initialized")
    }
}
