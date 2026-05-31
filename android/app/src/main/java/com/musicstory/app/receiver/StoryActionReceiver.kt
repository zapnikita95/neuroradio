package com.musicstory.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.launch

class StoryActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val app = context.applicationContext as? MusicStoryApp ?: return
        val pendingResult = goAsync()
        app.appScope.launch {
            try {
                when (intent?.action) {
                    ACTION_MANUAL_STORY -> {
                        StoryLog.i("Notification action: manual story")
                        app.storyOrchestrator.requestManualStory(fromNotification = true)
                    }
                    ACTION_STOP_MONITOR -> app.monitorLifecycle.pauseByUser()
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_MANUAL_STORY = "com.musicstory.app.ACTION_MANUAL_STORY"
        const val ACTION_STOP_MONITOR = "com.musicstory.app.ACTION_STOP_MONITOR"
    }
}
