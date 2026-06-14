package com.musicstory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface StoryHistoryDao {
    @Query("SELECT COUNT(*) FROM story_history WHERE trackKey = :trackKey AND playedAt = :playedAt")
    suspend fun countByTrackAndTime(trackKey: String, playedAt: Long): Int

    @Query("SELECT COUNT(*) FROM story_history WHERE serverId = :serverId")
    suspend fun countByServerId(serverId: String): Int

    @Query("SELECT * FROM story_history WHERE serverId = :serverId LIMIT 1")
    suspend fun findByServerId(serverId: String): StoryHistoryEntry?

    @Query(
        """
        SELECT * FROM story_history
        WHERE trackKey = :trackKey AND script = :script
        ORDER BY playedAt DESC LIMIT 1
        """,
    )
    suspend fun findLatestByTrackAndScript(trackKey: String, script: String): StoryHistoryEntry?

    @Query(
        """
        SELECT COUNT(*) FROM story_history
        WHERE trackKey = :trackKey AND script = :script AND playedAt >= :minPlayedAt
        """,
    )
    suspend fun countRecentSameScript(trackKey: String, script: String, minPlayedAt: Long): Int

    @Insert
    suspend fun insert(entry: StoryHistoryEntry)

    @Query("UPDATE story_history SET vote = :vote WHERE id = :localId")
    suspend fun updateVote(localId: Long, vote: String)

    @Query("UPDATE story_history SET serverId = :serverId WHERE id = :localId")
    suspend fun updateServerId(localId: Long, serverId: String)

    @Query(
        """
        UPDATE story_history
        SET storyNarrator = COALESCE(:storyNarrator, storyNarrator),
            seedScope = COALESCE(:seedScope, seedScope)
        WHERE id = :localId
        """,
    )
    suspend fun updatePersonaMeta(localId: Long, storyNarrator: String?, seedScope: String?)

    @Query("SELECT * FROM story_history ORDER BY playedAt DESC")
    fun observeAll(): Flow<List<StoryHistoryEntry>>

    @Query("SELECT * FROM story_history ORDER BY playedAt DESC LIMIT :limit")
    suspend fun getAllRecent(limit: Int = 500): List<StoryHistoryEntry>

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

    @Query(
        """
        DELETE FROM story_history
        WHERE id NOT IN (
            SELECT MIN(id) FROM story_history
            GROUP BY trackKey, script, playedAt
        )
        """,
    )
    suspend fun deleteDuplicateHistoryRows()

    @Query(
        """
        SELECT vote FROM story_history
        WHERE trackKey = :trackKey AND script = :script
        AND vote IS NOT NULL AND TRIM(vote) != ''
        LIMIT 1
        """,
    )
    suspend fun findVoteForTrackAndScript(trackKey: String, script: String): String?

    @Query(
        """
        SELECT * FROM story_history
        WHERE trackKey = :trackKey
        ORDER BY playedAt DESC LIMIT 1
        """,
    )
    suspend fun findLatestByTrackKey(trackKey: String): StoryHistoryEntry?

    @Query(
        """
        SELECT vote FROM story_history
        WHERE trackKey = :trackKey AND vote IS NOT NULL AND TRIM(vote) != ''
        ORDER BY playedAt DESC LIMIT 1
        """,
    )
    suspend fun findLatestVoteForTrack(trackKey: String): String?
}
