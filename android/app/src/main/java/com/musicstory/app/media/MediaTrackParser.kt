package com.musicstory.app.media

import android.app.Notification
import android.media.MediaMetadata
import android.os.Bundle
import com.musicstory.app.data.model.TrackInfo

object MediaTrackParser {

    private val TITLE_SEPARATORS = listOf(" — ", " – ", " - ")

    fun fromNotificationExtras(extras: Bundle, packageName: String): TrackInfo? {
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
            ?.takeIf { it.isNotBlank() }
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
            ?.takeIf { it.isNotBlank() }
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim()
            ?.takeIf { it.isNotBlank() }

        if (MediaJunkFilter.isJunkNotification(packageName, title, text, subText)) return null

        val fromMediaKeys = fromMediaMetadataBundle(extras, packageName)
        if (fromMediaKeys != null) return fromMediaKeys

        if (title == null) return null

        val parsedFromTitle = parseArtistTitle(title)
        if (parsedFromTitle != null) {
            return TrackInfo(
                artist = parsedFromTitle.first,
                title = parsedFromTitle.second,
                packageName = packageName,
            )
        }

        val artist = text ?: subText ?: return null
        if (artist == title) return null

        return TrackInfo(
            artist = artist,
            title = title,
            packageName = packageName,
        )
    }

    fun fromMediaMetadata(metadata: android.media.MediaMetadata, packageName: String): TrackInfo? {
        var title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.trim()
                ?.takeIf { it.isNotBlank() }
        if (title == null) return null

        var artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)?.trim()
                ?.takeIf { it.isNotBlank() }
            ?: metadata.getString(MediaMetadata.METADATA_KEY_AUTHOR)?.trim()
                ?.takeIf { it.isNotBlank() }

        if (artist.isNullOrBlank()) {
            parseArtistTitle(title)?.let { (parsedArtist, parsedTitle) ->
                artist = parsedArtist
                title = parsedTitle
            }
        }

        if (artist.isNullOrBlank()) {
            artist = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()
                ?.takeIf { it.isNotBlank() }
        }

        if (artist.isNullOrBlank() || artist == title) return null

        val album = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()
            ?.takeIf { it.isNotBlank() }
        val duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION)

        return TrackInfo(
            artist = artist!!,
            title = title!!,
            album = album,
            packageName = packageName,
            durationMs = duration.coerceAtLeast(0L),
        )
    }

    private fun fromMediaMetadataBundle(extras: Bundle, packageName: String): TrackInfo? {
        var title = extras.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: extras.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.trim()
                ?.takeIf { it.isNotBlank() }
        if (title == null) return null

        var artist = extras.getString(MediaMetadata.METADATA_KEY_ARTIST)?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: extras.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)?.trim()
                ?.takeIf { it.isNotBlank() }
            ?: extras.getString(MediaMetadata.METADATA_KEY_AUTHOR)?.trim()
                ?.takeIf { it.isNotBlank() }

        if (artist.isNullOrBlank()) {
            parseArtistTitle(title)?.let { (parsedArtist, parsedTitle) ->
                artist = parsedArtist
                title = parsedTitle
            }
        }

        if (artist.isNullOrBlank()) {
            artist = extras.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()
                ?.takeIf { it.isNotBlank() }
        }

        if (artist.isNullOrBlank() || artist == title) return null

        val album = extras.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()
            ?.takeIf { it.isNotBlank() }
        val duration = extras.getLong(MediaMetadata.METADATA_KEY_DURATION)

        return TrackInfo(
            artist = artist!!,
            title = title!!,
            album = album,
            packageName = packageName,
            durationMs = duration.coerceAtLeast(0L),
        )
    }

    fun looksLikeMediaNotification(extras: Bundle): Boolean {
        val template = extras.getString(Notification.EXTRA_TEMPLATE).orEmpty()
        if (template.contains("MediaStyle", ignoreCase = true)) return true
        if (extras.containsKey("android.mediaSession")) return true
        if (extras.containsKey("android.mediaSessionId")) return true
        if (extras.containsKey(MediaMetadata.METADATA_KEY_TITLE)) return true
        if (extras.containsKey(MediaMetadata.METADATA_KEY_ARTIST)) return true
        return false
    }

    private fun parseArtistTitle(combined: String): Pair<String, String>? {
        for (separator in TITLE_SEPARATORS) {
            val index = combined.indexOf(separator)
            if (index <= 0) continue
            val artist = combined.substring(0, index).trim()
            val title = combined.substring(index + separator.length).trim()
            if (artist.length >= 2 && title.length >= 2 && artist != title) {
                return artist to title
            }
        }
        return null
    }
}
