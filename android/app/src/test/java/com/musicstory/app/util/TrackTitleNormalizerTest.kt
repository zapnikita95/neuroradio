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
}
