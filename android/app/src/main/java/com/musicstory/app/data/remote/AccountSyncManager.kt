package com.musicstory.app.data.remote

import com.musicstory.app.data.local.StoryHistoryEntry
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
                .put("manualMode", payload.manualMode)
                .put("autoIntercept", payload.autoIntercept)
                .put("triggerMode", payload.triggerMode)
                .put("everyNTracks", payload.everyNTracks)
                .put("sameTrackStoryEveryN", payload.sameTrackStoryEveryN)
                .put("specificArtists", JSONArray(payload.specificArtists))
                .put("specificGenres", JSONArray(payload.specificGenres))
                .put("storyLength", payload.storyLength)
                .put("updatedAt", payload.updatedAt)
                .toString()
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/sync/settings")
                .header("Authorization", "Bearer $token")
                .put(body.toRequestBody("application/json".toMediaType()))
                .build()
            runCatching { http.newCall(req).execute().close() }
        }
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

    suspend fun pushHistoryEntry(
        baseUrl: String,
        entry: StoryHistoryEntry,
        localSyncCode: String = "",
        onSyncCodeUpdated: suspend (String) -> Unit = {},
    ) {
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext
            val syncId = if (entry.id > 0) "android-${entry.id}" else "${entry.trackKey}-${entry.playedAt}"
            val body = JSONObject()
                .put("id", syncId)
                .put("trackKey", entry.trackKey)
                .put("artist", entry.artist)
                .put("title", entry.title)
                .put("script", entry.script)
                .put("angle", entry.angle)
                .put("playedAt", entry.playedAt)
                .toString()

            fun postOnce(): Int {
                val req = Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/v1/sync/history")
                    .header("Authorization", "Bearer $token")
                    .post(body.toRequestBody("application/json".toMediaType()))
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

    data class SyncSettingsPayload(
        val manualMode: Boolean,
        val autoIntercept: Boolean,
        val triggerMode: String,
        val everyNTracks: Int,
        val sameTrackStoryEveryN: Int,
        val specificArtists: List<String>,
        val specificGenres: List<String>,
        val storyLength: String,
        val updatedAt: Long = System.currentTimeMillis(),
    )
}
