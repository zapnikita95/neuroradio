package com.musicstory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "scrobble_entries")
data class ScrobbleEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val artist: String,
    val title: String,
    val album: String? = null,
    val packageName: String? = null,
    val scrobbledAt: Long = System.currentTimeMillis(),
    val storyTriggered: Boolean = false,
)
