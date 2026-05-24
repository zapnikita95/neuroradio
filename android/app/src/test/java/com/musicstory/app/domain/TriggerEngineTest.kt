package com.musicstory.app.domain

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TriggerEngineTest {

    @Test
    fun everyNTracks_firesWhenCounterAlreadyAtN() {
        val engine = TriggerEngine()
        engine.restoreTracksSinceLastStory(10)
        val settings = TriggerSettings(mode = TriggerMode.EVERY_N_TRACKS, everyNTracks = 10)
        assertTrue(
            engine.onTrackPlayed(settings, trackKey = "a|t", trackArtist = "Artist", trackGenre = null),
        )
    }

    @Test
    fun everyNTracks_doesNotDeadlockAfterOverdueCounter() {
        val engine = TriggerEngine()
        engine.restoreTracksSinceLastStory(10)
        val settings = TriggerSettings(mode = TriggerMode.EVERY_N_TRACKS, everyNTracks = 10)
        assertTrue(engine.onTrackPlayed(settings, "a|t", "Artist", null))
        engine.onStoryPlaybackStarted()
        assertFalse(engine.onTrackPlayed(settings, "b|t", "Artist", null))
    }
}
