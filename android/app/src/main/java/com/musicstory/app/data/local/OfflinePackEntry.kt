package com.musicstory.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "offline_pack_entries",
    indices = [Index(value = ["packSessionId"]), Index(value = ["trackKey"])],
)
data class OfflinePackEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val packSessionId: Long,
    val trackKey: String,
    val artist: String,
    val title: String,
    val sortOrder: Int,
    /** collected | generating | ready | failed */
    val status: String,
    val localAudioPath: String? = null,
    val script: String? = null,
    val errorMessage: String? = null,
    val collectedAt: Long = System.currentTimeMillis(),
    val readyAt: Long? = null,
)
