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
                        val artist = intent.getStringExtra(EXTRA_ARTIST)?.trim().orEmpty()
                        val title = intent.getStringExtra(EXTRA_TITLE)?.trim().orEmpty()
                        val fromFactHint = intent.getBooleanExtra(EXTRA_FROM_FACT_HINT, false)
                        StoryLog.i(
                            "Notification action: manual story" +
                                if (artist.isNotBlank() && title.isNotBlank()) " ($artist — $title)" else "",
                        )
                        app.storyOrchestrator.requestManualStory(
                            fromNotification = true,
                            artist = artist.takeIf { it.isNotBlank() },
                            title = title.takeIf { it.isNotBlank() },
                            fromFactHint = fromFactHint,
                        )
                    }
                    ACTION_STOP_MONITOR -> {
                        StoryLog.i("Notification action: stop")
                        app.monitorLifecycle.handleStopFromNotification()
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_MANUAL_STORY = "com.musicstory.app.ACTION_MANUAL_STORY"
        const val ACTION_STOP_MONITOR = "com.musicstory.app.ACTION_STOP_MONITOR"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_FROM_FACT_HINT = "extra_from_fact_hint"
    }
}
