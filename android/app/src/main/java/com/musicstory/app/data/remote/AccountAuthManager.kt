package com.musicstory.app.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
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

    suspend fun fetchConfig(baseUrl: String): AuthConfig? = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/account/config")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val json = JSONObject(resp.body?.string().orEmpty())
                AuthConfig(
                    emailEnabled = json.optBoolean("emailEnabled"),
                    telegramEnabled = json.optBoolean("telegramEnabled"),
                    telegramBotUsername = parseOptionalString(json, "telegramBotUsername"),
                )
            }
        }.getOrNull()
    }

    suspend fun fetchProfile(baseUrl: String): AccountProfile? = withContext(Dispatchers.IO) {
        val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/account/profile")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        runCatching {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val json = JSONObject(resp.body?.string().orEmpty())
                parseProfile(json)
            }
        }.getOrNull()
    }

    suspend fun linkTelegram(baseUrl: String, authJson: JSONObject): Pair<AccountProfile?, String?> =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext null to "Нет связи с сервером"
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/account/telegram")
                .header("Authorization", "Bearer $token")
                .post(authJson.toString().toRequestBody("application/json".toMediaType()))
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    val body = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) {
                        return@withContext null to JSONObject(body).optString("error").ifBlank { "Ошибка Telegram" }
                    }
                    val json = JSONObject(body)
                    val profile = json.optJSONObject("profile") ?: json
                    parseProfile(profile) to null
                }
            }.getOrDefault(null to "Ошибка сети")
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

    suspend fun verifyEmailLogin(baseUrl: String, email: String, code: String): AccountProfile? =
        withContext(Dispatchers.IO) {
            val token = authManager.getAccessToken(baseUrl) ?: return@withContext null
            val body = JSONObject()
                .put("email", email.trim())
                .put("code", code.trim())
                .toString()
            val req = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/v1/account/email/verify")
                .header("Authorization", "Bearer $token")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            runCatching {
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext null
                    val json = JSONObject(resp.body?.string().orEmpty())
                    val profile = json.optJSONObject("profile") ?: json
                    parseProfile(profile)
                }
            }.getOrNull()
        }

    data class AuthConfig(
        val emailEnabled: Boolean,
        val telegramEnabled: Boolean,
        val telegramBotUsername: String?,
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
