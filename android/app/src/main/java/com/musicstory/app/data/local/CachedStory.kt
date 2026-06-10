package com.musicstory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_stories")
data class CachedStory(
    @PrimaryKey val trackKey: String,
    val artist: String,
    val title: String,
    val year: Int? = null,
    val genre: String? = null,
    val script: String,
    val audioUrl: String? = null,
    val localAudioPath: String? = null,
    val demo: Boolean = false,
    val fetchedAt: Long = System.currentTimeMillis(),
)
