package com.musicstory.app.domain

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R

object TrialStartedNotifier {
    private const val CHANNEL_ID = "trial_started"
    private const val NOTIFICATION_ID = 9101

    fun show(context: Context) {
        ensureChannel(context)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.logo_efir_ai)
            .setContentTitle(context.getString(R.string.trial_started_notif_title))
            .setContentText(context.getString(R.string.trial_started_notif_body))
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    context.getString(R.string.trial_started_notif_body),
                ),
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.trial_started_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.trial_started_channel_desc)
            },
        )
    }
}
