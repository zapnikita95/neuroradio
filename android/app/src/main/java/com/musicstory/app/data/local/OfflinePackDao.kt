package com.musicstory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface OfflinePackDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entry: OfflinePackEntry): Long

    @Query("SELECT * FROM offline_pack_entries WHERE packSessionId = :sessionId ORDER BY sortOrder ASC")
    fun observeBySession(sessionId: Long): Flow<List<OfflinePackEntry>>

    @Query("SELECT * FROM offline_pack_entries WHERE packSessionId = :sessionId ORDER BY sortOrder ASC")
    suspend fun listBySession(sessionId: Long): List<OfflinePackEntry>

    @Query("SELECT COUNT(*) FROM offline_pack_entries WHERE packSessionId = :sessionId")
    suspend fun countBySession(sessionId: Long): Int

    @Query("SELECT COUNT(*) FROM offline_pack_entries WHERE packSessionId = :sessionId AND status = 'ready'")
    suspend fun countReadyBySession(sessionId: Long): Int

    @Query("SELECT * FROM offline_pack_entries WHERE packSessionId = :sessionId AND trackKey = :trackKey LIMIT 1")
    suspend fun findByTrack(sessionId: Long, trackKey: String): OfflinePackEntry?

    @Query(
        "UPDATE offline_pack_entries SET status = :status, localAudioPath = :localPath, script = :script, " +
            "readyAt = :readyAt, errorMessage = :error WHERE id = :id",
    )
    suspend fun updateResult(
        id: Long,
        status: String,
        localPath: String?,
        script: String?,
        readyAt: Long?,
        error: String?,
    )

    @Query("UPDATE offline_pack_entries SET status = 'generating' WHERE id = :id")
    suspend fun markGenerating(id: Long)

    @Query("DELETE FROM offline_pack_entries WHERE packSessionId = :sessionId")
    suspend fun deleteSession(sessionId: Long)

    @Query("SELECT * FROM offline_pack_entries WHERE packSessionId = :sessionId AND status = 'ready' AND trackKey = :trackKey LIMIT 1")
    suspend fun findReadyTrack(sessionId: Long, trackKey: String): OfflinePackEntry?

    @Query("SELECT * FROM offline_pack_entries WHERE status = 'ready' ORDER BY readyAt DESC LIMIT 1")
    suspend fun latestReadySessionEntry(): OfflinePackEntry?
}
