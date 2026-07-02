package com.musicstory.app.domain

data class PendingStoryFeedback(
    val artist: String,
    val title: String,
    val script: String,
    val trackKey: String,
    /** Text exactly as voiced — for share and display. */
    val voicedText: String = script,
    val storyNarrator: String? = null,
    val playedAt: Long = System.currentTimeMillis(),
)
