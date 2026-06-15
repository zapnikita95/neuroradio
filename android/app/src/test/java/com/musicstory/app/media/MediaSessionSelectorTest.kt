package com.musicstory.app.media

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaSessionSelectorTest {

    @Test
    fun newPipeIsAllowed() {
        assertTrue(MediaSessionSelector.isAllowedMusicPackage("org.schabi.newpipe"))
    }

    @Test
    fun youtubeAppIsBlocked() {
        assertFalse(MediaSessionSelector.isAllowedMusicPackage("com.google.android.youtube"))
    }

    @Test
    fun youtubeMusicIsAllowed() {
        assertTrue(MediaSessionSelector.isAllowedMusicPackage("com.google.android.apps.youtube.music"))
    }

    @Test
    fun netflixIsBlocked() {
        assertFalse(MediaSessionSelector.isAllowedMusicPackage("com.netflix.mediaclient"))
    }

    @Test
    fun spotifyStillPreferred() {
        assertTrue(MediaSessionSelector.isPreferredPackage("com.spotify.music"))
        assertTrue(MediaSessionSelector.priority("com.spotify.music") < MediaSessionSelector.priority("org.schabi.newpipe"))
    }
}
