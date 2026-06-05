package com.musicstory.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManualStoryGateTest {

    private val base = 1_000_000L

    @Test
    fun noPreviousStory_allowsAndShowsButton() {
        val r = ManualStoryGate.evaluate(
            lastStoryStartedAtMs = 0L,
            nowMs = base,
            hasValidTrack = true,
            canManualStory = true,
            isGenerationActive = false,
            preparingFromNotification = false,
        )
        assertTrue(r.allowed)
        assertTrue(r.showAction)
    }

    @Test
    fun lessThan6Sec_blocksWithMessage() {
        val r = ManualStoryGate.evaluate(
            lastStoryStartedAtMs = base - 3_000L,
            nowMs = base,
            hasValidTrack = true,
            canManualStory = true,
            isGenerationActive = false,
            preparingFromNotification = false,
        )
        assertFalse(r.allowed)
        assertFalse(r.showAction)
        assertTrue(r.userMessage!!.contains("3"))
    }

    @Test
    fun after60Sec_allowsEvenDuringGeneration() {
        val r = ManualStoryGate.evaluate(
            lastStoryStartedAtMs = base - 65_000L,
            nowMs = base,
            hasValidTrack = true,
            canManualStory = true,
            isGenerationActive = true,
            preparingFromNotification = false,
        )
        assertTrue(r.allowed)
        assertTrue(r.showAction)
    }

    @Test
    fun between6And60Sec_hidesWhileGenerating() {
        val r = ManualStoryGate.evaluate(
            lastStoryStartedAtMs = base - 20_000L,
            nowMs = base,
            hasValidTrack = true,
            canManualStory = true,
            isGenerationActive = true,
            preparingFromNotification = false,
        )
        assertFalse(r.showAction)
        assertFalse(r.allowed)
    }

    @Test
    fun between6And60Sec_showsWhenIdle() {
        val r = ManualStoryGate.evaluate(
            lastStoryStartedAtMs = base - 20_000L,
            nowMs = base,
            hasValidTrack = true,
            canManualStory = true,
            isGenerationActive = false,
            preparingFromNotification = false,
        )
        assertTrue(r.showAction)
        assertTrue(r.allowed)
    }
}
