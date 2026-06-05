package com.musicstory.app.domain

/** Cooldown rules for manual «Рассказать историю» from notification / home. */
object ManualStoryGate {
    /** Minimum gap after story playback started — anti-spam. */
    const val MIN_INTERVAL_MS = 6_000L

    /** After this since story start — no cooldown / generation lock. */
    const val UNLOCK_AFTER_MS = 60_000L

    data class Result(
        val showAction: Boolean,
        val allowed: Boolean,
        val userMessage: String? = null,
        val retryInMs: Long = 0L,
    )

    fun evaluate(
        lastStoryStartedAtMs: Long,
        nowMs: Long = System.currentTimeMillis(),
        hasValidTrack: Boolean,
        canManualStory: Boolean,
        isGenerationActive: Boolean,
        isBackendFetching: Boolean = false,
        preparingFromNotification: Boolean,
    ): Result {
        if (isBackendFetching || preparingFromNotification) {
            return Result(showAction = false, allowed = false)
        }
        if (!hasValidTrack || !canManualStory) {
            return Result(showAction = false, allowed = false)
        }

        val elapsed = if (lastStoryStartedAtMs > 0L) {
            nowMs - lastStoryStartedAtMs
        } else {
            Long.MAX_VALUE
        }

        if (elapsed >= UNLOCK_AFTER_MS) {
            return Result(showAction = true, allowed = true)
        }

        if (lastStoryStartedAtMs > 0L && elapsed < MIN_INTERVAL_MS) {
            val waitSec = ((MIN_INTERVAL_MS - elapsed + 999L) / 1000L).toInt().coerceAtLeast(1)
            return Result(
                showAction = false,
                allowed = false,
                userMessage = "Подожди $waitSec сек — история только что играла",
                retryInMs = MIN_INTERVAL_MS - elapsed,
            )
        }

        if (isGenerationActive) {
            return Result(showAction = false, allowed = false)
        }

        return Result(showAction = true, allowed = true)
    }
}
