package com.musicstory.app.media

import android.app.Notification
import android.media.MediaMetadata
import android.os.Bundle
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.util.TrackTitleNormalizer

object MediaTrackParser {

    private val TITLE_SEPARATORS = listOf(" — ", " – ", " - ")

    fun fromNotificationExtras(extras: Bundle, packageName: String): TrackInfo? {
        val notifTitle = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
            ?.takeIf { it.isNotBlank() }
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
            ?.takeIf { it.isNotBlank() }
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim()
            ?.takeIf { it.isNotBlank() }

        if (MediaJunkFilter.isJunkNotification(packageName, notifTitle, text, subText)) return null

        val fromMediaKeys = fromMediaMetadataBundle(extras, packageName)
        if (fromMediaKeys != null) return fromMediaKeys

        val metadataTitle = readMetadataTitle(extras)
        val metadataArtist = readMetadataArtist(extras)
        val titleCandidate = notifTitle ?: metadataTitle ?: return null
        val artistCandidate = text ?: subText ?: metadataArtist

        val parsedFromTitle = parseArtistTitle(titleCandidate)
        if (parsedFromTitle != null) {
            return finalizeTrack(parsedFromTitle.first, parsedFromTitle.second, packageName)
        }

        if (!artistCandidate.isNullOrBlank() && artistCandidate != titleCandidate) {
            return finalizeTrack(artistCandidate, titleCandidate, packageName)
        }

        return null
    }

    fun fromMediaMetadata(metadata: android.media.MediaMetadata, packageName: String): TrackInfo? {
        var title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.trim()
                ?.takeIf { it.isNotBlank() }
        if (title == null) return null

        var artist = readArtistFromMetadataStrings(
            metadata.getString(MediaMetadata.METADATA_KEY_ARTIST),
            metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST),
            metadata.getString(MediaMetadata.METADATA_KEY_AUTHOR),
        )

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
        var title = readMetadataTitle(extras) ?: return null

        var artist = readArtistFromMetadataStrings(
            extras.getString(MediaMetadata.METADATA_KEY_ARTIST),
            extras.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST),
            extras.getString(MediaMetadata.METADATA_KEY_AUTHOR),
        )

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

    private fun readMetadataTitle(extras: Bundle): String? {
        return extras.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: extras.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.trim()
                ?.takeIf { it.isNotBlank() }
    }

    private fun readMetadataArtist(extras: Bundle): String? {
        return readArtistFromMetadataStrings(
            extras.getString(MediaMetadata.METADATA_KEY_ARTIST),
            extras.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST),
            extras.getString(MediaMetadata.METADATA_KEY_AUTHOR),
        )
    }

    private fun readArtistFromMetadataStrings(vararg values: String?): String? {
        for (value in values) {
            val trimmed = value?.trim()?.takeIf { it.isNotBlank() }
            if (trimmed != null) return trimmed
        }
        return null
    }

    private fun parseArtistTitle(combined: String): Pair<String, String>? {
        for (separator in TITLE_SEPARATORS) {
            val index = findArtistTitleSeparator(combined, separator)
            if (index <= 0) continue
            val artist = combined.substring(0, index).trim()
            val title = combined.substring(index + separator.length).trim()
            if (artist.length >= 2 && title.length >= 2 && artist != title) {
                return artist to title
            }
        }
        return null
    }

    /** Ignore « - » inside an unclosed «(live at - …)» suffix. */
    private fun findArtistTitleSeparator(combined: String, separator: String): Int {
        if (separator != " - ") {
            return combined.indexOf(separator)
        }
        var searchFrom = 0
        while (searchFrom < combined.length) {
            val index = combined.indexOf(separator, searchFrom)
            if (index <= 0) return -1
            if (!isInsideOpenParentheses(combined, index)) return index
            searchFrom = index + separator.length
        }
        return -1
    }

    private fun isInsideOpenParentheses(text: String, index: Int): Boolean {
        val lastOpen = text.lastIndexOf('(', index)
        if (lastOpen < 0) return false
        val lastClose = text.lastIndexOf(')', index)
        return lastClose < lastOpen
    }

    private fun finalizeTrack(artist: String, title: String, packageName: String): TrackInfo {
        return TrackInfo(
            artist = TrackTitleNormalizer.normalizeArtist(artist),
            title = TrackTitleNormalizer.cleanNotificationTitle(title),
            packageName = packageName,
        )
    }
}
