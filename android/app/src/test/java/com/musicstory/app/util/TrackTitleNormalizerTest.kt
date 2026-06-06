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
}
