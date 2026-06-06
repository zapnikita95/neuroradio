package com.musicstory.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "story_history",
    indices = [Index(value = ["trackKey"]), Index(value = ["serverId"], unique = true)],
)
data class StoryHistoryEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** Cloud UUID — stable across devices after sync. */
    val serverId: String? = null,
    val trackKey: String,
    val artist: String,
    val title: String,
    val script: String,
    val angle: String? = null,
    val playedAt: Long = System.currentTimeMillis(),
    /** "like" or "dislike" after user feedback. */
    val vote: String? = null,
)
