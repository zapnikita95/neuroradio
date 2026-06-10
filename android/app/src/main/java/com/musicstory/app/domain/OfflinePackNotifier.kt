package com.musicstory.app.domain

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.musicstory.app.MainActivity
import com.musicstory.app.R

class OfflinePackNotifier(private val context: Context) {

    fun showCollectingProgress(collected: Int, target: Int) {
        ensureChannel()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.offline_pack_collecting_title))
            .setContentText(
                context.getString(R.string.offline_pack_collecting_body, collected, target),
            )
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    context.getString(R.string.offline_pack_collecting_hint),
                ),
            )
            .setProgress(target, collected, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openSettingsIntent())
            .build()
        manager().notify(NOTIF_COLLECTING, notification)
    }

    fun showTracksCollected(count: Int) {
        ensureChannel()
        manager().cancel(NOTIF_COLLECTING)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.offline_pack_tracks_ready_title))
            .setContentText(context.getString(R.string.offline_pack_tracks_ready_body, count))
            .setAutoCancel(true)
            .setContentIntent(openSettingsIntent())
            .build()
        manager().notify(NOTIF_TRACKS_READY, notification)
    }

    fun showGeneratingProgress(ready: Int, target: Int) {
        ensureChannel()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.offline_pack_generating_title))
            .setContentText(context.getString(R.string.offline_pack_generating_body, ready, target))
            .setProgress(target, ready, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openSettingsIntent())
            .build()
        manager().notify(NOTIF_GENERATING, notification)
    }

    fun showPackReady(readyCount: Int) {
        manager().cancel(NOTIF_GENERATING)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.offline_pack_done_title))
            .setContentText(context.getString(R.string.offline_pack_done_body, readyCount))
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    context.getString(R.string.offline_pack_done_hint),
                ),
            )
            .setAutoCancel(true)
            .setContentIntent(openSettingsIntent())
            .build()
        manager().notify(NOTIF_PACK_READY, notification)
    }

    fun showPackFailed() {
        manager().cancel(NOTIF_GENERATING)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.offline_pack_failed_title))
            .setContentText(context.getString(R.string.offline_pack_failed_body))
            .setAutoCancel(true)
            .setContentIntent(openSettingsIntent())
            .build()
        manager().notify(NOTIF_PACK_FAILED, notification)
    }

    fun cancelAll() {
        manager().cancel(NOTIF_COLLECTING)
        manager().cancel(NOTIF_GENERATING)
    }

    private fun openSettingsIntent(): PendingIntent = PendingIntent.getActivity(
        context,
        30,
        Intent(context, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_OPEN_SETTINGS, true)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = manager()
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.channel_offline_pack_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_offline_pack_description)
        }
        manager.createNotificationChannel(channel)
    }

    private fun manager(): NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    companion object {
        const val CHANNEL_ID = "offline_pack"
        private const val NOTIF_COLLECTING = 43_001
        private const val NOTIF_TRACKS_READY = 43_002
        private const val NOTIF_GENERATING = 43_003
        private const val NOTIF_PACK_READY = 43_004
        private const val NOTIF_PACK_FAILED = 43_005
    }
}
