package com.musicstory.app.data.local

data class ScrobbleArtistStat(
    val artist: String,
    val playCount: Int,
    val lastPlayedAt: Long,
)

data class ScrobbleGenreStat(
    val genre: String,
    val playCount: Int,
    val lastPlayedAt: Long,
)
