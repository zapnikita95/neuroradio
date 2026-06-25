package com.musicstory.app.data.model

import com.musicstory.app.media.MediaJunkFilter

data class TrackInfo(
    val artist: String,
    val title: String,
    val album: String? = null,
    val packageName: String? = null,
    val durationMs: Long = 0L,
) {
    val displayKey: String
        get() = "${artist.lowercase()}|${title.lowercase()}"

    fun isPlaceholder(): Boolean {
        val a = artist.lowercase()
        val t = title.lowercase()
        if (a.contains("вспоминаем трек") || a.contains("remember")) return true
        if (t.contains("скоро начн") || t.contains("остановились") || t.contains("will begin")) return true
        if (t.contains("музыка скоро") || t == "paused") return true
        if (MediaJunkFilter.isJunkTrack(packageName, artist, title)) return true
        return false
    }

    fun isValid(): Boolean =
        artist.isNotBlank() &&
            title.isNotBlank() &&
            !isPlaceholder() &&
            artist.length <= MAX_FIELD_LEN &&
            title.length <= MAX_FIELD_LEN

    companion object {
        private const val MAX_FIELD_LEN = 200
    }
}
