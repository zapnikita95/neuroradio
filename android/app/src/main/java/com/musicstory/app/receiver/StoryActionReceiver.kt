package com.musicstory.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.domain.MonitorNotificationState
import com.musicstory.app.service.MediaMonitorService
import kotlinx.coroutines.launch

class StoryActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val app = context.applicationContext as? MusicStoryApp ?: return
        when (intent?.action) {
            ACTION_MANUAL_STORY -> {
                MonitorNotificationState.setPreparing(true)
                MediaMonitorService.refreshNotification(context)
                app.storyOrchestrator.requestManualStory()
            }
            ACTION_STOP_MONITOR -> app.appScope.launch {
                app.monitorLifecycle.pauseByUser()
            }
        }
    }

    companion object {
        const val ACTION_MANUAL_STORY = "com.musicstory.app.ACTION_MANUAL_STORY"
        const val ACTION_STOP_MONITOR = "com.musicstory.app.ACTION_STOP_MONITOR"
    }
}
