package com.musicstory.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.musicstory.app.MusicStoryApp

class StoryActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_MANUAL_STORY) return
        val app = context.applicationContext as? MusicStoryApp ?: return
        app.storyOrchestrator.requestManualStory()
    }

    companion object {
        const val ACTION_MANUAL_STORY = "com.musicstory.app.ACTION_MANUAL_STORY"
    }
}
