package com.musicstory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface StoryHistoryDao {
    @Insert
    suspend fun insert(entry: StoryHistoryEntry)

    @Query("SELECT * FROM story_history ORDER BY playedAt DESC")
    fun observeAll(): Flow<List<StoryHistoryEntry>>

    @Query(
        """
        SELECT script FROM story_history
        WHERE trackKey = :trackKey
        ORDER BY playedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getRecentScripts(trackKey: String, limit: Int = 8): List<String>

    @Query(
        """
        SELECT script FROM story_history
        WHERE artist = :artist COLLATE NOCASE
        ORDER BY playedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getRecentScriptsForArtist(artist: String, limit: Int = 16): List<String>

    @Query("SELECT COUNT(*) FROM story_history WHERE trackKey = :trackKey")
    suspend fun countForTrack(trackKey: String): Int
}
