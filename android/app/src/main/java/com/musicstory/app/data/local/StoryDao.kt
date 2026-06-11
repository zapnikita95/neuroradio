package com.musicstory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface StoryDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(story: CachedStory)

    @Query("SELECT * FROM cached_stories WHERE trackKey = :trackKey LIMIT 1")
    suspend fun getByTrackKey(trackKey: String): CachedStory?

    @Query(
        "SELECT * FROM cached_stories WHERE (localAudioPath IS NULL OR localAudioPath = '') " +
            "AND audioUrl IS NOT NULL AND audioUrl != ''",
    )
    suspend fun findWithoutLocalAudio(): List<CachedStory>

    @Query("UPDATE cached_stories SET localAudioPath = :path WHERE trackKey = :trackKey")
    suspend fun updateLocalAudioPath(trackKey: String, path: String?)

    @Query("UPDATE cached_stories SET localAudioPath = NULL")
    suspend fun clearAllLocalAudioPaths()

    @Query("DELETE FROM cached_stories WHERE fetchedAt < :before")
    suspend fun deleteOlderThan(before: Long)

    @Query("DELETE FROM cached_stories")
    suspend fun deleteAll()
}
