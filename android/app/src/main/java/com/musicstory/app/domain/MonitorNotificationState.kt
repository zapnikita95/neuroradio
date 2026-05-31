package com.musicstory.app.domain

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ManualStoryNotificationUi(
    val showManualAction: Boolean = false,
    val statusHint: String? = null,
)

/** Foreground notification UI while a story is being prepared from the notification action. */
object MonitorNotificationState {
    private val _preparingStory = MutableStateFlow(false)
    val preparingStory: StateFlow<Boolean> = _preparingStory.asStateFlow()

    private val _manualStoryUi = MutableStateFlow(ManualStoryNotificationUi())
    val manualStoryUi: StateFlow<ManualStoryNotificationUi> = _manualStoryUi.asStateFlow()

    fun setPreparing(preparing: Boolean) {
        _preparingStory.value = preparing
    }

    fun setManualStoryUi(showAction: Boolean, statusHint: String?) {
        _manualStoryUi.value = ManualStoryNotificationUi(showAction, statusHint)
    }
}
