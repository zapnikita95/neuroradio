package com.musicstory.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.musicstory.app.MusicStoryApp

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val app = context.applicationContext as? MusicStoryApp ?: return
        if (app.mediaControllerManager.hasNotificationAccess()) {
            com.musicstory.app.service.MediaMonitorService.start(context)
        }
    }
}
