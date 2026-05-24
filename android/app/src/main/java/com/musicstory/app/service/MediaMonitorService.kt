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
import com.musicstory.app.receiver.StoryActionReceiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class MediaMonitorService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var trackObserverJob: Job? = null
    private var lastTrackKey: String? = null

    override fun onCreate() {
        super.onCreate()
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
        trackObserverJob?.cancel()
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
            ) { sessionKey, notificationKey -> sessionKey ?: notificationKey }
                .distinctUntilChanged()
                .collect { key ->
                    val track = app.mediaControllerManager.effectiveNowPlaying.value
                    if (track != null && track.isValid() && key != null && key != lastTrackKey) {
                        lastTrackKey = key
                        onNewTrack(app, track)
                    }
                    updateNotification(track)
                }
        }
    }

    private suspend fun onNewTrack(app: MusicStoryApp, track: TrackInfo) {
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

        val contentTitle = when {
            track != null && track.isValid() -> "${track.artist} — ${track.title}"
            else -> getString(R.string.notification_listening)
        }
        val contentText = when {
            track != null && track.isValid() -> getString(R.string.notification_now_playing, track.artist, track.title)
            else -> getString(R.string.notification_listening_hint)
        }

        return NotificationCompat.Builder(this, MusicStoryApp.CHANNEL_MONITOR)
            .setContentTitle(contentTitle)
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(
                R.drawable.ic_notification,
                getString(R.string.action_manual_story),
                manualStory,
            )
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
