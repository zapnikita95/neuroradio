package com.musicstory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ScrobbleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entry: ScrobbleEntry): Long

    @Query("SELECT * FROM scrobble_entries ORDER BY scrobbledAt DESC")
    fun observeAll(): Flow<List<ScrobbleEntry>>

    @Query("SELECT * FROM scrobble_entries ORDER BY scrobbledAt DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<ScrobbleEntry>>

    @Query("SELECT COUNT(*) FROM scrobble_entries")
    suspend fun count(): Int

    @Query("SELECT COUNT(*) FROM scrobble_entries WHERE storyTriggered = 1")
    suspend fun countStoryTriggered(): Int

    @Query(
        """
        SELECT * FROM scrobble_entries
        WHERE artist = :artist AND title = :title
        ORDER BY scrobbledAt DESC LIMIT 1
        """,
    )
    suspend fun findLatest(artist: String, title: String): ScrobbleEntry?

    @Query("DELETE FROM scrobble_entries")
    suspend fun deleteAll()
}
