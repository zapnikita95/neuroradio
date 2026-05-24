package com.musicstory.app.domain

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Foreground notification UI while a story is being prepared from the notification action. */
object MonitorNotificationState {
    private val _preparingStory = MutableStateFlow(false)
    val preparingStory: StateFlow<Boolean> = _preparingStory.asStateFlow()

    fun setPreparing(preparing: Boolean) {
        _preparingStory.value = preparing
    }
}
