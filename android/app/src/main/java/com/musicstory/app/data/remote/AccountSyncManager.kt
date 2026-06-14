package com.musicstory.app.data.remote

import com.musicstory.app.data.local.StoryHistoryEntry
import com.musicstory.app.data.local.parseStoryHistoryJson
import com.musicstory.app.data.local.toSyncJson
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class AccountSyncManager(
    private val authManager: BackendAuthManager,
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    suspend fun refreshStatus(baseUrl: String): SyncStatus? = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/sync/status")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val json = JSONObject(resp.body?.string().orEmpty())
                SyncStatus(
                    linked = json.optBoolean("linked"),
                    accountId = json.optString("accountId").ifBlank { null },
                    syncCode = json.optString("syncCode").ifBlank { null },
                    deviceCount = json.optInt("deviceCount"),
                )
            }
        }.getOrNull()
    }

    suspend fun createAccount(baseUrl: String): String? = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/sync/create")
            .header("Authorization", "Bearer $token")
            .post("{}".toRequestBody("application/json".toMediaType()))
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                JSONObject(resp.body?.string().orEmpty()).optString("syncCode").ifBlank { null }
            }
        }.getOrNull()
    }

    suspend fun linkAccount(baseUrl: String, syncCode: String): Boolean = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext false
        val body = JSONObject().put("sync_code", syncCode.trim().uppercase()).toString()
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/sync/link")
            .header("Authorization", "Bearer $token")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        runCatching {
            http.newCall(req).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    suspend fun pushSettings(baseUrl: String, payload: SyncSettingsPayload) {
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext
            val body = JSONObject()
            payload.manualMode?.let { body.put("manualMode", it) }
            payload.autoIntercept?.let { body.put("autoIntercept", it) }
            payload.factNotificationsEnabled?.let { body.put("factNotificationsEnabled", it) }
            payload.triggerMode?.let { body.put("triggerMode", it) }
            payload.everyNTracks?.let { body.put("everyNTracks", it) }
            payload.sameTrackStoryEveryN?.let { body.put("sameTrackStoryEveryN", it) }
            payload.specificArtists?.let { body.put("specificArtists", JSONArray(it)) }
            payload.specificGenres?.let { body.put("specificGenres", JSONArray(it)) }
            payload.storyLength?.let { body.put("storyLength", it) }
            payload.storyNarrator?.let { body.put("storyNarrator", it) }
            payload.ttsVoice?.let { body.put("ttsVoice", it) }
            payload.ttsSpeed?.let { body.put("ttsSpeed", it) }
            payload.ttsEmotion?.let { body.put("ttsEmotion", it) }
            payload.ttsPlaybackEngine?.let { body.put("ttsPlaybackEngine", it) }
            payload.serverTtsProvider?.let { body.put("serverTtsProvider", it) }
            payload.speakTrackNamesInVoiceover?.let { body.put("speakTrackNamesInVoiceover", it) }
            payload.llmProvider?.let { body.put("llmProvider", it) }
            body.put("updatedAt", payload.updatedAt)
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/sync/settings")
                .header("Authorization", "Bearer $token")
                .put(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            runCatching { http.newCall(req).execute().close() }
        }
    }

    suspend fun pullSettings(baseUrl: String): SyncSettingsPayload? = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/sync/settings")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val json = JSONObject(resp.body?.string().orEmpty())
                val s = json.optJSONObject("settings") ?: return@withContext null
                SyncSettingsPayload(
                    manualMode = if (s.has("manualMode")) s.getBoolean("manualMode") else null,
                    autoIntercept = if (s.has("autoIntercept")) s.getBoolean("autoIntercept") else null,
                    factNotificationsEnabled = if (s.has("factNotificationsEnabled")) {
                        s.getBoolean("factNotificationsEnabled")
                    } else {
                        null
                    },
                    triggerMode = s.optString("triggerMode").ifBlank { null },
                    everyNTracks = if (s.has("everyNTracks")) s.getInt("everyNTracks") else null,
                    sameTrackStoryEveryN = if (s.has("sameTrackStoryEveryN")) s.getInt("sameTrackStoryEveryN") else null,
                    specificArtists = s.optJSONArray("specificArtists")?.let { arr ->
                        buildList {
                            for (i in 0 until arr.length()) add(arr.optString(i))
                        }
                    },
                    specificGenres = s.optJSONArray("specificGenres")?.let { arr ->
                        buildList {
                            for (i in 0 until arr.length()) add(arr.optString(i))
                        }
                    },
                    storyLength = s.optString("storyLength").ifBlank { null },
                    storyNarrator = s.optString("storyNarrator").ifBlank { null },
                    ttsVoice = s.optString("ttsVoice").ifBlank { null },
                    ttsSpeed = s.optString("ttsSpeed").ifBlank { null },
                    ttsEmotion = s.optString("ttsEmotion").ifBlank { null },
                    ttsPlaybackEngine = s.optString("ttsPlaybackEngine").ifBlank { null },
                    serverTtsProvider = s.optString("serverTtsProvider").ifBlank { null },
                    speakTrackNamesInVoiceover = if (s.has("speakTrackNamesInVoiceover")) {
                        s.optBoolean("speakTrackNamesInVoiceover")
                    } else {
                        null
                    },
                    llmProvider = s.optString("llmProvider").ifBlank { null },
                    updatedAt = s.optLong("updatedAt", 0L),
                )
            }
        }.getOrNull()
    }

    /**
     * Re-registers this install on the server when Railway wiped in-memory sync data.
     * Returns true when [refreshStatus] reports linked.
     */
    suspend fun ensureSyncRegistered(
        baseUrl: String,
        localSyncCode: String,
        onSyncCodeUpdated: suspend (String) -> Unit,
    ): Boolean = withContext(Dispatchers.IO) {
        refreshStatus(baseUrl)?.takeIf { it.linked }?.let { return@withContext true }

        val code = localSyncCode.trim()
        if (code.isNotBlank() && linkAccount(baseUrl, code)) {
            return@withContext true
        }

        val newCode = createAccount(baseUrl) ?: return@withContext false
        onSyncCodeUpdated(newCode)
        refreshStatus(baseUrl)?.linked == true
    }

    suspend fun pullHistory(baseUrl: String, since: Long = 0): List<StoryHistoryEntry>? =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/sync/history?since=$since")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext null
                    val json = JSONObject(resp.body?.string().orEmpty())
                    val arr = json.optJSONArray("history") ?: return@withContext emptyList()
                    buildList {
                        for (i in 0 until arr.length()) {
                            val item = arr.optJSONObject(i) ?: continue
                            add(parseStoryHistoryJson(item))
                        }
                    }
                }
            }.getOrNull()
        }

    suspend fun pullScrobbles(baseUrl: String, since: Long = 0): List<com.musicstory.app.data.local.ScrobbleEntry>? =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/sync/scrobbles?since=$since")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext null
                    val json = JSONObject(resp.body?.string().orEmpty())
                    val arr = json.optJSONArray("scrobbles") ?: return@withContext emptyList()
                    buildList {
                        for (i in 0 until arr.length()) {
                            val item = arr.optJSONObject(i) ?: continue
                            add(
                                com.musicstory.app.data.local.ScrobbleEntry(
                                    serverId = item.optString("id").ifBlank { null },
                                    artist = item.optString("artist"),
                                    title = item.optString("title"),
                                    album = item.optString("album").ifBlank { null },
                                    genre = item.optString("genre").ifBlank { null },
                                    packageName = item.optString("packageName").ifBlank { null },
                                    storyTriggered = item.optBoolean("storyTriggered"),
                                    scrobbledAt = item.optLong("scrobbledAt", System.currentTimeMillis()),
                                ),
                            )
                        }
                    }
                }
            }.getOrNull()
        }

    suspend fun pushScrobbleEntry(
        baseUrl: String,
        entry: com.musicstory.app.data.local.ScrobbleEntry,
        localSyncCode: String = "",
        onSyncCodeUpdated: suspend (String) -> Unit = {},
    ) {
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext
            val syncId = entry.serverId?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
            val body = JSONObject()
                .put("id", syncId)
                .put("artist", entry.artist)
                .put("title", entry.title)
                .put("scrobbledAt", entry.scrobbledAt)
                .put("storyTriggered", entry.storyTriggered)
            entry.album?.let { body.put("album", it) }
            entry.genre?.let { body.put("genre", it) }
            entry.packageName?.let { body.put("packageName", it) }

            fun postOnce(): Int {
                val req = Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/v1/sync/scrobbles")
                    .header("Authorization", "Bearer $token")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                return runCatching {
                    http.newCall(req).execute().use { it.code }
                }.getOrDefault(-1)
            }

            when (postOnce()) {
                200, 201 -> return@withContext
                404 -> {
                    if (!ensureSyncRegistered(baseUrl, localSyncCode, onSyncCodeUpdated)) return@withContext
                    postOnce()
                }
            }
        }
    }

    data class SyncStatus(
        val linked: Boolean,
        val accountId: String?,
        val syncCode: String?,
        val deviceCount: Int,
    )

    suspend fun pushHistoryEntry(
        baseUrl: String,
        entry: StoryHistoryEntry,
        localSyncCode: String = "",
        onSyncCodeUpdated: suspend (String) -> Unit = {},
    ) {
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext
            val syncId = entry.serverId?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
            val body = entry.copy(serverId = syncId).toSyncJson()

            fun postOnce(): Int {
                val req = Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/v1/sync/history")
                    .header("Authorization", "Bearer $token")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                return runCatching {
                    http.newCall(req).execute().use { it.code }
                }.getOrDefault(-1)
            }

            when (postOnce()) {
                200, 201 -> return@withContext
                404 -> {
                    if (!ensureSyncRegistered(baseUrl, localSyncCode, onSyncCodeUpdated)) return@withContext
                    postOnce()
                }
            }
        }
    }

    data class SyncSettingsPayload(
        val manualMode: Boolean? = null,
        val autoIntercept: Boolean? = null,
        val factNotificationsEnabled: Boolean? = null,
        val triggerMode: String? = null,
        val everyNTracks: Int? = null,
        val sameTrackStoryEveryN: Int? = null,
        val specificArtists: List<String>? = null,
        val specificGenres: List<String>? = null,
        val storyLength: String? = null,
        val storyNarrator: String? = null,
        val ttsVoice: String? = null,
        val ttsSpeed: String? = null,
        val ttsEmotion: String? = null,
        val ttsPlaybackEngine: String? = null,
        val serverTtsProvider: String? = null,
        val speakTrackNamesInVoiceover: Boolean? = null,
        val llmProvider: String? = null,
        val appLanguage: String? = null,
        val updatedAt: Long = System.currentTimeMillis(),
    )
}
