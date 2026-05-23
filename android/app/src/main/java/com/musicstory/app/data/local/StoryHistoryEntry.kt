package com.musicstory.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "story_history",
    indices = [Index(value = ["trackKey"])],
)
data class StoryHistoryEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val trackKey: String,
    val artist: String,
    val title: String,
    val script: String,
    val angle: String? = null,
    val playedAt: Long = System.currentTimeMillis(),
)
