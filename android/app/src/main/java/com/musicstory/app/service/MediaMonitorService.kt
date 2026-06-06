package com.musicstory.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.musicstory.app.MainActivity
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.domain.MonitorNotificationState
import com.musicstory.app.receiver.StoryActionReceiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MediaMonitorService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var trackObserverJob: Job? = null
    private var listenCountJob: Job? = null
    private var lastTrackKey: String? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        val app = application as MusicStoryApp
        app.mediaControllerManager.start()
        observeTracks(app)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val app = application as MusicStoryApp
            val track = app.mediaControllerManager.effectiveNowPlaying.value
            startForeground(NOTIFICATION_ID, buildNotification(track))
        } catch (e: SecurityException) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        trackObserverJob?.cancel()
        listenCountJob?.cancel()
        serviceScope.cancel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun observeTracks(app: MusicStoryApp) {
        trackObserverJob?.cancel()
        trackObserverJob = serviceScope.launch {
            combine(
                app.mediaControllerManager.nowPlaying.map { it?.displayKey },
                MediaNotificationListener.lastNotificationTrack.map { it?.displayKey },
                MonitorNotificationState.preparingStory,
                MonitorNotificationState.manualStoryUi,
            ) { sessionKey, notificationKey, _, _ -> sessionKey ?: notificationKey }
                .distinctUntilChanged()
                .collect { key ->
                    val track = app.mediaControllerManager.resolveNowPlayingTrack()
                        ?: app.mediaControllerManager.effectiveNowPlaying.value
                    if (track != null && track.isValid() && key != null && key != lastTrackKey) {
                        if (lastTrackKey != null) {
                            app.storyOrchestrator.onPlaybackTrackSkipped()
                        }
                        lastTrackKey = key
                        scheduleTrackCounted(app, track, key)
                    }
                    updateNotification(track)
                }
        }
        serviceScope.launch {
            combine(
                MonitorNotificationState.preparingStory,
                MonitorNotificationState.manualStoryUi,
            ) { preparing, manualUi -> preparing to manualUi }
                .collect {
                    updateNotification(app.mediaControllerManager.effectiveNowPlaying.value)
                }
        }
    }

    private fun scheduleTrackCounted(app: MusicStoryApp, track: TrackInfo, trackKey: String) {
        listenCountJob?.cancel()
        listenCountJob = serviceScope.launch {
            val thresholdSec = app.settingsDataStore.trackListenThresholdSeconds.first()
            if (thresholdSec > 0) {
                delay(thresholdSec * 1000L)
                val currentKey = app.mediaControllerManager.resolveNowPlayingTrack()?.displayKey
                    ?: app.mediaControllerManager.effectiveNowPlaying.value?.displayKey
                if (currentKey != trackKey) return@launch
            }
            onTrackCounted(app, track)
        }
    }

    private suspend fun onTrackCounted(app: MusicStoryApp, track: TrackInfo) {
        if (!app.scrobbleRepository.wasRecentlyScrobbled(track)) {
            app.scrobbleRepository.scrobbleTrack(track)
        }
        app.storyOrchestrator.onTrackChanged(track)
    }

    private fun updateNotification(track: TrackInfo?) {
        val notification = buildNotification(track)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun friendlySourceLabel(packageName: String?): String? = when (packageName) {
        "com.spotify.music" -> "Spotify"
        "ru.yandex.music" -> "Яндекс Музыка"
        else -> packageName?.substringAfterLast('.')?.takeIf { it.isNotBlank() }
    }

    private fun buildNotification(track: TrackInfo?): Notification {
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val manualStory = PendingIntent.getBroadcast(
            this,
            1,
            Intent(this, StoryActionReceiver::class.java).apply {
                action = StoryActionReceiver.ACTION_MANUAL_STORY
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val stopMonitor = PendingIntent.getBroadcast(
            this,
            2,
            Intent(this, StoryActionReceiver::class.java).apply {
                action = StoryActionReceiver.ACTION_STOP_MONITOR
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val preparing = MonitorNotificationState.preparingStory.value
        val manualUi = MonitorNotificationState.manualStoryUi.value
        val contentTitle = when {
            preparing -> getString(R.string.app_name)
            track != null && track.isValid() -> "${track.artist} — ${track.title}"
            else -> getString(R.string.app_name)
        }
        val contentText = when {
            preparing -> getString(R.string.notification_preparing_story)
            manualUi.statusHint != null -> manualUi.statusHint
            track != null && track.isValid() -> friendlySourceLabel(track.packageName)
                ?: getString(R.string.status_monitoring)
            else -> getString(R.string.notification_listening_hint)
        }

        val builder = NotificationCompat.Builder(this, MusicStoryApp.CHANNEL_MONITOR)
            .setContentTitle(contentTitle)
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)

        if (manualUi.showManualAction && !preparing) {
            builder.addAction(
                R.drawable.ic_notification,
                getString(R.string.action_manual_story),
                manualStory,
            )
        }

        return builder
            .addAction(
                R.drawable.ic_notification,
                getString(R.string.action_stop_monitor),
                stopMonitor,
            )
            .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        const val NOTIFICATION_ID = 1001

        @Volatile
        private var instance: MediaMonitorService? = null

        fun refreshNotification(context: Context) {
            val service = instance ?: return
            val app = context.applicationContext as? MusicStoryApp ?: return
            val track = app.mediaControllerManager.effectiveNowPlaying.value
            service.updateNotification(track)
        }

        fun start(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted = ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.POST_NOTIFICATIONS,
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) return
            }
            val intent = Intent(context, MediaMonitorService::class.java)
            try {
                context.startForegroundService(intent)
            } catch (_: IllegalStateException) {
            } catch (_: SecurityException) {
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MediaMonitorService::class.java))
        }
    }
}
