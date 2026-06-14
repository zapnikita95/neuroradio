package com.musicstory.app.data.local

import org.json.JSONObject

private fun isFactSeedScope(value: String): Boolean =
    value.trim().lowercase() in setOf("track", "artist", "album")

fun parseStoryHistoryJson(item: JSONObject): StoryHistoryEntry {
    val rawAngle = item.optString("angle").ifBlank { null }
    val seedScope = item.optString("seedScope").ifBlank {
        item.optString("seed_scope").ifBlank {
            rawAngle?.takeIf { isFactSeedScope(it) }
        }
    }
    val storyNarrator = item.optString("storyNarrator").ifBlank {
        item.optString("story_narrator").ifBlank { null }
    }
    val legacyAngle = rawAngle?.takeIf { !isFactSeedScope(it) }
    return StoryHistoryEntry(
        serverId = item.optString("id").ifBlank { null },
        trackKey = item.optString("trackKey"),
        artist = item.optString("artist"),
        title = item.optString("title"),
        script = item.optString("script"),
        angle = legacyAngle,
        storyNarrator = storyNarrator,
        seedScope = seedScope,
        playedAt = item.optLong("playedAt", System.currentTimeMillis()),
        vote = item.optString("vote").ifBlank { null },
    )
}

fun StoryHistoryEntry.toSyncJson(): JSONObject {
    val body = JSONObject()
        .put("id", serverId ?: "")
        .put("trackKey", trackKey)
        .put("artist", artist)
        .put("title", title)
        .put("script", script)
        .put("playedAt", playedAt)
    storyNarrator?.takeIf { it.isNotBlank() }?.let { body.put("storyNarrator", it) }
    seedScope?.takeIf { it.isNotBlank() }?.let { body.put("seedScope", it) }
    vote?.let { body.put("vote", it) }
    return body
}
