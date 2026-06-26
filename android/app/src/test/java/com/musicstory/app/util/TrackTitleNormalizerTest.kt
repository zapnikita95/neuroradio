package com.musicstory.app.util

import org.junit.Assert.assertEquals
import org.junit.Test

class TrackTitleNormalizerTest {
    @Test
    fun stripsRussianFilmSuffix() {
        assertEquals(
            "Pump It",
            TrackTitleNormalizer.normalize("Pump It (из фильма «Такси 4»)"),
        )
    }

    @Test
    fun keepsTitleWhenNoSuffix() {
        assertEquals("The Ketchup Song", TrackTitleNormalizer.normalize("The Ketchup Song"))
    }

    @Test
    fun stripsFeatSuffix() {
        assertEquals(
            "Gangsta's Paradise",
            TrackTitleNormalizer.normalize("Gangsta's Paradise (feat. L.V.)"),
        )
    }

    @Test
    fun matchKeyIgnoresArtistGuest() {
        val a = TrackTitleNormalizer.matchKey("Coolio, L.V.", "Gangsta's Paradise (feat. L.V.)")
        val b = TrackTitleNormalizer.matchKey("Coolio", "Gangsta's Paradise")
        assertEquals(a, b)
    }

    @Test
    fun normalizeStripsLiveSuffix() {
        assertEquals(
            "If It Means a Lot to You",
            TrackTitleNormalizer.normalize("If It Means a Lot to You (Live at The Audio Compound)"),
        )
    }

    @Test
    fun normalizeStripsTruncatedLiveSuffix() {
        assertEquals(
            "If It Means a Lot to You",
            TrackTitleNormalizer.normalize("If It Means a Lot to You (Live at"),
        )
    }

    @Test
    fun matchKeyTreatsStudioAndLiveAsSameSong() {
        val studio = TrackTitleNormalizer.matchKey(
            "A Day To Remember",
            "If It Means a Lot to You",
        )
        val live = TrackTitleNormalizer.matchKey(
            "A Day To Remember",
            "If It Means a Lot to You (Live at The Audio Compound)",
        )
        assertEquals(studio, live)
    }
}
