package com.musicstory.app.domain

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.musicstory.app.MainActivity
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.receiver.StoryActionReceiver
import com.musicstory.app.util.StoryLog

/** Local push when a hot fact exists for the current track (manual mode only). */
class FactHintNotifier(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun maybeShow(
        track: TrackInfo,
        hasHotFact: Boolean,
        enabled: Boolean,
        manualMode: Boolean,
        storySessionActive: Boolean,
    ) {
        if (!enabled || !manualMode || storySessionActive || !hasHotFact || !track.isValid()) return

        val trackKey = track.displayKey
        val now = System.currentTimeMillis()
        val lastTrackAt = prefs.getLong(keyLastTrack(trackKey), 0L)
        if (now - lastTrackAt < TRACK_COOLDOWN_MS) return

        pruneHourlyTimestamps(now)
        val recent = prefs.getString(KEY_HOURLY_TS, "").orEmpty()
            .split(',')
            .mapNotNull { it.trim().toLongOrNull() }
            .filter { now - it < HOUR_MS }
        if (recent.size >= MAX_PER_HOUR) return

        ensureChannel()
        val notification = NotificationCompat.Builder(context, CHANNEL_FACT_HINT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.fact_hint_notification_title, track.title))
            .setContentText(context.getString(R.string.fact_hint_notification_body, track.artist))
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    context.getString(R.string.fact_hint_notification_body, track.artist),
                ),
            )
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .addAction(
                R.drawable.ic_notification,
                context.getString(R.string.fact_hint_action_tell),
                tellStoryIntent(),
            )
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID_BASE + trackKey.hashCode(), notification)

        prefs.edit()
            .putLong(keyLastTrack(trackKey), now)
            .putString(KEY_HOURLY_TS, (recent + now).joinToString(","))
            .apply()
        StoryLog.i("Fact hint notification shown: ${track.artist} — ${track.title}")
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_FACT_HINT) != null) return
        val channel = NotificationChannel(
            CHANNEL_FACT_HINT,
            context.getString(R.string.channel_fact_hint_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_fact_hint_description)
        }
        manager.createNotificationChannel(channel)
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        context,
        20,
        Intent(context, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun tellStoryIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        21,
        Intent(context, StoryActionReceiver::class.java).apply {
            action = StoryActionReceiver.ACTION_MANUAL_STORY
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun pruneHourlyTimestamps(now: Long) {
        val recent = prefs.getString(KEY_HOURLY_TS, "").orEmpty()
            .split(',')
            .mapNotNull { it.trim().toLongOrNull() }
            .filter { now - it < HOUR_MS }
        prefs.edit().putString(KEY_HOURLY_TS, recent.joinToString(",")).apply()
    }

    private fun keyLastTrack(trackKey: String) = "last_track_$trackKey"

    companion object {
        const val CHANNEL_FACT_HINT = "fact_hint"
        private const val PREFS_NAME = "fact_hint_notifier"
        private const val KEY_HOURLY_TS = "hourly_ts"
        private const val MAX_PER_HOUR = 3
        private const val HOUR_MS = 3_600_000L
        private const val TRACK_COOLDOWN_MS = 86_400_000L
        private const val NOTIFICATION_ID_BASE = 42_000
    }
}
