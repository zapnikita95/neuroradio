package com.musicstory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ScrobbleDao {

    @Insert
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

    @Query(
        """
        SELECT genre FROM scrobble_entries
        WHERE artist = :artist AND genre IS NOT NULL AND TRIM(genre) != ''
        ORDER BY scrobbledAt DESC LIMIT 1
        """,
    )
    suspend fun findLatestGenreForArtist(artist: String): String?

    @Query("UPDATE scrobble_entries SET genre = :genre WHERE id = :id")
    suspend fun updateGenre(id: Long, genre: String)

    @Query("UPDATE scrobble_entries SET storyTriggered = 1 WHERE id = :id")
    suspend fun markStoryTriggered(id: Long)

    @Query(
        """
        SELECT artist, COUNT(*) AS playCount, MAX(scrobbledAt) AS lastPlayedAt
        FROM scrobble_entries
        GROUP BY artist
        ORDER BY lastPlayedAt DESC
        LIMIT :limit
        """,
    )
    fun observeTopArtists(limit: Int): Flow<List<ScrobbleArtistStat>>

    @Query(
        """
        SELECT genre, COUNT(*) AS playCount, MAX(scrobbledAt) AS lastPlayedAt
        FROM scrobble_entries
        WHERE genre IS NOT NULL AND TRIM(genre) != ''
        GROUP BY genre
        ORDER BY lastPlayedAt DESC
        LIMIT :limit
        """,
    )
    fun observeTopGenres(limit: Int): Flow<List<ScrobbleGenreStat>>

    @Query("SELECT COUNT(*) FROM scrobble_entries WHERE serverId = :serverId")
    suspend fun countByServerId(serverId: String): Int

    @Query(
        """
        SELECT COUNT(*) FROM scrobble_entries
        WHERE artist = :artist AND title = :title AND scrobbledAt = :scrobbledAt
        """,
    )
    suspend fun countByTrackAndTime(artist: String, title: String, scrobbledAt: Long): Int

    @Query("SELECT * FROM scrobble_entries ORDER BY scrobbledAt DESC LIMIT :limit")
    suspend fun getRecent(limit: Int = 500): List<ScrobbleEntry>

    @Query("DELETE FROM scrobble_entries")
    suspend fun deleteAll()

    @Query("DELETE FROM scrobble_entries WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<Long>)
}
