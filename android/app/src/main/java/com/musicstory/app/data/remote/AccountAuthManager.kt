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
                AccountProfile(
                    accountId = parseOptionalString(json, "accountId"),
                    email = parseOptionalString(json, "email"),
                    telegramId = json.optLong("telegramId").takeIf { it > 0L },
                    telegramUsername = parseOptionalString(json, "telegramUsername"),
                    plan = parseOptionalString(json, "plan"),
                    trialUntil = json.optLong("trialUntil").takeIf { it > 0L },
                    premiumUntil = json.optLong("premiumUntil").takeIf { it > 0L },
                )
            }
        }.getOrNull()
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
                    AccountProfile(
                        accountId = parseOptionalString(profile, "accountId"),
                        email = parseOptionalString(profile, "email"),
                        telegramId = profile.optLong("telegramId").takeIf { it > 0L },
                        telegramUsername = parseOptionalString(profile, "telegramUsername"),
                        plan = parseOptionalString(profile, "plan"),
                        trialUntil = profile.optLong("trialUntil").takeIf { it > 0L },
                        premiumUntil = profile.optLong("premiumUntil").takeIf { it > 0L },
                    )
                }
            }.getOrNull()
        }

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
