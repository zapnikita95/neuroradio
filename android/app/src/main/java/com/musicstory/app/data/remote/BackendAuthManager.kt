package com.musicstory.app.data.remote

import android.content.Context
import com.google.gson.annotations.SerializedName
import com.musicstory.app.BuildConfig
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.util.StoryLog
import com.musicstory.app.security.AppSigning
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

class BackendAuthManager(
    private val context: Context,
    private val settingsDataStore: SettingsDataStore,
) {
    private val mutex = Mutex()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .build()

    suspend fun warmUp(baseUrl: String) {
        getAccessToken(baseUrl)
    }

    suspend fun getAccessToken(baseUrl: String, forceRefresh: Boolean = false): String? {
        val normalized = normalizeBaseUrl(baseUrl)
        return mutex.withLock {
            val cached = settingsDataStore.readAuthState()
            val now = System.currentTimeMillis()
            if (!forceRefresh &&
                cached.accessToken.isNotBlank() &&
                cached.expiresAtMs > now + TOKEN_REFRESH_SKEW_MS
            ) {
                return cached.accessToken
            }
            fetchTokenWithRetry(normalized, cached.installId)
        }
    }

    suspend fun invalidateToken() {
        mutex.withLock {
            settingsDataStore.clearAuthToken()
        }
    }

    private suspend fun fetchTokenWithRetry(baseUrl: String, existingInstallId: String): String? {
        repeat(MAX_FETCH_ATTEMPTS) { attempt ->
            when (val outcome = fetchToken(baseUrl, existingInstallId)) {
                is TokenOutcome.Success -> return outcome.token
                is TokenOutcome.Fatal -> return null
                is TokenOutcome.Retry -> if (attempt < MAX_FETCH_ATTEMPTS - 1) {
                    delay(RETRY_DELAY_MS * (attempt + 1))
                }
            }
        }
        return null
    }

    private sealed class TokenOutcome {
        data class Success(val token: String) : TokenOutcome()
        data object Retry : TokenOutcome()
        data object Fatal : TokenOutcome()
    }

    private suspend fun fetchToken(baseUrl: String, existingInstallId: String): TokenOutcome {
        val installId = existingInstallId.ifBlank { UUID.randomUUID().toString() }
        if (existingInstallId.isBlank()) {
            settingsDataStore.saveInstallId(installId)
        }

        val certSha256 = AppSigning.certSha256(context) ?: return TokenOutcome.Fatal
        val body = JSONObject()
            .put("install_id", installId)
            .put("package_name", context.packageName)
            .put("cert_sha256", certSha256)
            .put("app_version", BuildConfig.VERSION_NAME)
            .toString()

        val request = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/v1/auth/token")
            .header("Content-Type", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        return try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    StoryLog.e("Auth token failed: HTTP ${response.code} ${response.message}")
                    return when (response.code) {
                        400, 403 -> TokenOutcome.Fatal
                        429 -> TokenOutcome.Retry
                        in 500..599 -> TokenOutcome.Retry
                        else -> TokenOutcome.Fatal
                    }
                }
                val payload = response.body?.string() ?: return TokenOutcome.Retry
                val tokenResponse = gson.fromJson(payload, TokenResponse::class.java)
                val token = tokenResponse.accessToken?.trim().orEmpty()
                if (token.isEmpty()) return TokenOutcome.Retry

                val expiresInSec = tokenResponse.expiresIn ?: DEFAULT_EXPIRES_IN_SEC
                val expiresAtMs = System.currentTimeMillis() + expiresInSec * 1000L
                settingsDataStore.saveAuthToken(
                    token,
                    expiresAtMs,
                    tokenResponse.secretsTransportKey,
                )
                StoryLog.i("Auth token OK, expires in ${expiresInSec}s")
                TokenOutcome.Success(token)
            }
        } catch (e: Exception) {
            StoryLog.e("Auth token error", e)
            TokenOutcome.Retry
        }
    }

    private fun normalizeBaseUrl(url: String): String {
        val trimmed = url.trim().trimEnd('/')
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }

    private data class TokenResponse(
        @SerializedName("access_token") val accessToken: String? = null,
        @SerializedName("expires_in") val expiresIn: Long? = null,
        @SerializedName("secrets_transport_key") val secretsTransportKey: String? = null,
    )

    companion object {
        /** Обновляем токен, когда до истечения осталось меньше 7 дней. */
        private val TOKEN_REFRESH_SKEW_MS = TimeUnit.DAYS.toMillis(7)
        private const val DEFAULT_EXPIRES_IN_SEC = 7776000L
        private const val MAX_FETCH_ATTEMPTS = 3
        private const val RETRY_DELAY_MS = 1500L
        private val gson = com.google.gson.Gson()
    }
}
