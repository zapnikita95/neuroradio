package com.musicstory.app.media

import com.musicstory.app.data.model.TrackInfo
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaJunkFilterTest {

    private val ytm = "com.google.android.apps.youtube.music"

    @Test
    fun youtubeMusicSubscriptionPromoIsJunk() {
        val title = "Оформите подписку YouTube Music..."
        assertTrue(
            MediaJunkFilter.isJunkNotification(ytm, title, null, "music"),
        )
        assertFalse(
            TrackInfo(
                artist = "music",
                title = title,
                packageName = ytm,
            ).isValid(),
        )
    }

    @Test
    fun realYoutubeMusicTrackIsNotJunk() {
        val track = TrackInfo(
            artist = "Radiohead",
            title = "Creep",
            packageName = ytm,
        )
        assertFalse(MediaJunkFilter.isJunkTrack(ytm, track.artist, track.title))
        assertTrue(track.isValid())
    }

    @Test
    fun englishSubscribePromoIsJunk() {
        assertTrue(
            MediaJunkFilter.isJunkNotification(
                ytm,
                "Subscribe to YouTube Music Premium",
                null,
                "music",
            ),
        )
    }

    @Test
    fun voiceMessageMetadataIsJunk() {
        assertTrue(
            MediaJunkFilter.isNonMusicPlaybackMetadata(
                artist = "Voice message",
                title = "Ульяна Митяева",
            ),
        )
        assertTrue(
            MediaJunkFilter.isNonMusicPlaybackMetadata(
                artist = "Аня 💚",
                title = "Voice message",
            ),
        )
        assertFalse(
            TrackInfo(
                artist = "Voice message",
                title = "Ульяна Митяева",
                packageName = "org.telegram.messenger",
            ).isValid(),
        )
        assertTrue(
            TrackInfo(
                artist = "Radiohead",
                title = "Creep",
                packageName = "org.telegram.messenger",
            ).isValid(),
        )
    }
}
