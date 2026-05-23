package com.musicstory.app.data.model

data class TrackInfo(
    val artist: String,
    val title: String,
    val album: String? = null,
    val packageName: String? = null,
    val durationMs: Long = 0L,
) {
    val displayKey: String
        get() = "${artist.lowercase()}|${title.lowercase()}"

    fun isValid(): Boolean = artist.isNotBlank() && title.isNotBlank()
}
