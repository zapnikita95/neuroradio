package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactBundle
import com.musicstory.app.domain.ReferenceFactQuality
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull

/** Собирает факты из Wikipedia, DuckDuckGo, Wikidata и MusicBrainz. */
object FactAggregator {

    private const val SOURCE_TIMEOUT_MS = 8_000L

    suspend fun fetchBundle(
        artist: String,
        title: String,
        countryCode: String?,
        recordingMbid: String? = null,
        artistMbid: String? = null,
    ): ReferenceFactBundle = coroutineScope {
        val wiki = async {
            withTimeoutOrNull(SOURCE_TIMEOUT_MS) {
                WikipediaFacts.fetchBundle(artist, title, countryCode)
            } ?: ReferenceFactBundle()
        }
        val ddg = async {
            withTimeoutOrNull(SOURCE_TIMEOUT_MS) {
                runCatching { DuckDuckGoFacts.fetch(artist, title) }.getOrDefault(emptyList())
            } ?: emptyList()
        }
        val wikidata = async {
            withTimeoutOrNull(SOURCE_TIMEOUT_MS) {
                runCatching { WikidataFacts.fetch(artist, title, countryCode) }.getOrDefault(emptyList())
            } ?: emptyList()
        }
        val mbTrack = async {
            withTimeoutOrNull(SOURCE_TIMEOUT_MS) {
                MusicBrainzFacts.fetchRecordingAnnotations(recordingMbid)
            } ?: emptyList()
        }
        val mbArtist = async {
            withTimeoutOrNull(SOURCE_TIMEOUT_MS) {
                MusicBrainzFacts.fetchArtistAnnotations(artistMbid)
            } ?: emptyList()
        }

        val wikiBundle = wiki.await()
        val ddgFacts = ddg.await()
        val wikidataFacts = wikidata.await()
        val mbTrackFacts = mbTrack.await()
        val mbArtistFacts = mbArtist.await()

        val (ddgTrack, ddgArtist) = splitByMention(ddgFacts, title, artist)
        val (wdTrack, wdArtist) = splitByMention(wikidataFacts, title, artist)

        ReferenceFactBundle(
            trackFacts = mergeFacts(
                wikiBundle.trackFacts,
                ddgTrack,
                wdTrack,
                mbTrackFacts,
            ),
            artistFacts = mergeFacts(
                wikiBundle.artistFacts,
                ddgArtist,
                wdArtist,
                mbArtistFacts,
            ),
        )
    }

    private fun mergeFacts(vararg pools: List<String>): List<String> =
        ReferenceFactQuality.filterAndRank(pools.flatMap { it }, 8)

    private fun splitByMention(facts: List<String>, title: String, artist: String): Pair<List<String>, List<String>> {
        if (facts.isEmpty()) return emptyList<String>() to emptyList()
        val titleNorm = normalize(title)
        val artistNorm = normalize(artist)
        val track = mutableListOf<String>()
        val artistFacts = mutableListOf<String>()
        for (fact in facts) {
            val norm = normalize(fact)
            when {
                titleNorm.length >= 4 && norm.contains(titleNorm) -> track += fact
                artistNorm.length >= 3 && norm.contains(artistNorm) -> artistFacts += fact
                else -> artistFacts += fact
            }
        }
        return track to artistFacts
    }

    private fun normalize(text: String): String =
        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()
}
