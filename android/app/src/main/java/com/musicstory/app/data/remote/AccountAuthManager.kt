package com.musicstory.app.data.remote

import android.content.Context
import com.musicstory.app.data.local.ScrobbleEntry
import com.musicstory.app.data.local.StoryHistoryEntry
import com.musicstory.app.data.remote.BillingEntitlementResponse
import com.musicstory.app.util.DeviceFingerprint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import com.musicstory.app.util.normalizeHttpsOrigin
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class AccountAuthManager(
    private val authManager: BackendAuthManager,
) {
    private fun parseOptionalString(json: JSONObject, key: String): String? =
        json.optString(key).trim().takeUnless { it.isBlank() || it.equals("null", ignoreCase = true) }
    private val http = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    private fun parseProfile(json: JSONObject): AccountProfile =
        AccountProfile(
            accountId = parseOptionalString(json, "accountId"),
            email = parseOptionalString(json, "email"),
            telegramId = json.optLong("telegramId").takeIf { it > 0L },
            telegramUsername = parseOptionalString(json, "telegramUsername"),
            plan = parseOptionalString(json, "plan"),
            trialUntil = json.optLong("trialUntil").takeIf { it > 0L },
            premiumUntil = json.optLong("premiumUntil").takeIf { it > 0L },
        )

    private fun parseCloudHistory(json: JSONObject): List<StoryHistoryEntry> {
        val arr = json.optJSONArray("history") ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                add(
                    StoryHistoryEntry(
                        serverId = item.optString("id").ifBlank { null },
                        trackKey = item.optString("trackKey"),
                        artist = item.optString("artist"),
                        title = item.optString("title"),
                        script = item.optString("script"),
                        angle = item.optString("angle").ifBlank { null },
                        playedAt = item.optLong("playedAt", System.currentTimeMillis()),
                        vote = item.optString("vote").ifBlank { null },
                    ),
                )
            }
        }
    }

    private fun parseCloudScrobbles(json: JSONObject): List<ScrobbleEntry> {
        val arr = json.optJSONArray("scrobbles") ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                add(
                    ScrobbleEntry(
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

    private fun parseLoginResponse(raw: String, errorFallback: String): AccountLoginResult {
        val json = JSONObject(raw)
        if (json.has("error") && !json.optString("error").isNullOrBlank()) {
            return AccountLoginResult(error = json.optString("error").ifBlank { errorFallback })
        }
        val profileJson = json.optJSONObject("profile") ?: json
        return AccountLoginResult(
            profile = parseProfile(profileJson),
            history = parseCloudHistory(json),
            scrobbles = parseCloudScrobbles(json),
        )
    }

    suspend fun fetchProfileWithCloud(baseUrl: String): AccountLoginResult = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext AccountLoginResult(error = "Нет связи с сервером")
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/account/profile")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return@withContext AccountLoginResult(error = "Профиль недоступен")
                }
                parseLoginResponse(raw, "Профиль недоступен")
            }
        }.getOrDefault(AccountLoginResult(error = "Ошибка сети"))
    }

    suspend fun fetchProfile(baseUrl: String): AccountProfile? =
        fetchProfileWithCloud(baseUrl).profile

    suspend fun fetchConfig(baseUrl: String): AuthConfig? = withContext(Dispatchers.IO) {
        fetchPublicConfig(baseUrl) ?: run {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/account/config")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext null
                    parseAuthConfig(JSONObject(resp.body?.string().orEmpty()))
                }
            }.getOrNull()
        }
    }

    private fun fetchPublicConfig(baseUrl: String): AuthConfig? {
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/public/auth-config")
            .get()
            .build()
        return runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                parseAuthConfig(JSONObject(resp.body?.string().orEmpty()))
            }
        }.getOrNull()
    }

    private fun parseAuthConfig(json: JSONObject): AuthConfig =
        AuthConfig(
            emailEnabled = json.optBoolean("emailEnabled"),
            telegramEnabled = json.optBoolean("telegramEnabled"),
            telegramBotUsername = parseOptionalString(json, "telegramBotUsername"),
            telegramWidgetBaseUrl = normalizeHttpsOrigin(parseOptionalString(json, "telegramWidgetBaseUrl")),
        )

    suspend fun claimDeviceWelcomeTrial(baseUrl: String, deviceFingerprint: String): WelcomeTrialClaimResult? =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
            val body = JSONObject().put("device_fingerprint", deviceFingerprint).toString()
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/account/welcome-device")
                .header("Authorization", "Bearer $token")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) return@withContext null
                    val json = JSONObject(raw)
                    val entJson = json.optJSONObject("entitlement")
                    WelcomeTrialClaimResult(
                        granted = json.optBoolean("granted"),
                        trialUntil = json.optLong("trialUntil").takeIf { it > 0L },
                        entitlement = entJson?.let { parseEntitlement(it) },
                    )
                }
            }.getOrNull()
        }

    private fun parseEntitlement(json: JSONObject): BillingEntitlementResponse =
        BillingEntitlementResponse(
            plan = parseOptionalString(json, "plan"),
            premiumUntil = json.optLong("premiumUntil").takeIf { it > 0L },
            trialUntil = json.optLong("trialUntil").takeIf { it > 0L },
        )

    suspend fun linkTelegram(baseUrl: String, authJson: JSONObject, context: Context): AccountLoginResult =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext AccountLoginResult(error = "Нет связи с сервером")
            authJson.put("device_fingerprint", DeviceFingerprint.get(context))
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/account/telegram")
                .header("Authorization", "Bearer $token")
                .post(authJson.toString().toRequestBody("application/json".toMediaType()))
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    val body = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) {
                        return@withContext AccountLoginResult(
                            error = JSONObject(body).optString("error").ifBlank { "Ошибка Telegram" },
                        )
                    }
                    parseLoginResponse(body, "Ошибка Telegram")
                }
            }.getOrDefault(AccountLoginResult(error = "Ошибка сети"))
        }

    suspend fun startEmailLogin(baseUrl: String, email: String): String? = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
        val body = JSONObject().put("email", email.trim()).toString()
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/account/email/start")
            .header("Authorization", "Bearer $token")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    JSONObject(resp.body?.string().orEmpty()).optString("error").ifBlank { null }
                } else {
                    null
                }
            }
        }.getOrNull()
    }

    suspend fun verifyEmailLogin(
        baseUrl: String,
        email: String,
        code: String,
        context: Context,
    ): AccountLoginResult =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext AccountLoginResult(error = "Нет связи с сервером")
            val body = JSONObject()
                .put("email", email.trim())
                .put("code", code.trim())
                .put("device_fingerprint", DeviceFingerprint.get(context))
                .toString()
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/account/email/verify")
                .header("Authorization", "Bearer $token")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) {
                        return@withContext AccountLoginResult(
                            error = JSONObject(raw).optString("error").ifBlank { "Не удалось войти" },
                        )
                    }
                    parseLoginResponse(raw, "Не удалось войти")
                }
            }.getOrDefault(AccountLoginResult(error = "Ошибка сети"))
        }

    data class WelcomeTrialClaimResult(
        val granted: Boolean,
        val trialUntil: Long?,
        val entitlement: BillingEntitlementResponse?,
    ) {
        val trialActive: Boolean
            get() {
                val until = trialUntil ?: entitlement?.trialUntil ?: 0L
                return until > System.currentTimeMillis() && entitlement?.plan == "trial"
            }
    }

    data class AccountLoginResult(
        val profile: AccountProfile? = null,
        val history: List<StoryHistoryEntry> = emptyList(),
        val scrobbles: List<ScrobbleEntry> = emptyList(),
        val error: String? = null,
    )

    data class AuthConfig(
        val emailEnabled: Boolean,
        val telegramEnabled: Boolean,
        val telegramBotUsername: String?,
        val telegramWidgetBaseUrl: String?,
    )

    data class AccountProfile(
        val accountId: String?,
        val email: String?,
        val telegramId: Long?,
        val telegramUsername: String?,
        val plan: String?,
        val trialUntil: Long?,
        val premiumUntil: Long?,
    ) {
        val isLoggedIn: Boolean get() = !email.isNullOrBlank() || telegramId != null
    }
}
