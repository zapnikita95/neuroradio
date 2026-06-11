package com.musicstory.app.data.auth

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

class TelegramOAuthCoordinator private constructor() {

    private var pendingCode: CompletableDeferred<String>? = null
    private var activeCodeVerifier: String? = null

    suspend fun signIn(
        activity: Activity,
        clientId: String,
        redirectUri: String,
        backendBaseUrl: String,
    ): Pair<String, String> {
        cancelPending()

        val botId = clientId.trim()
        val redirect = resolveRedirectUri(redirectUri)
        if (botId.isBlank()) {
            throw TelegramOAuthException.Failed("Telegram OAuth: bot id не настроен на сервере")
        }

        val verifier = makeCodeVerifier()
        val challenge = makeCodeChallenge(verifier)
        val startUrl = buildStartUrl(backendBaseUrl, botId, redirect, challenge)

        val deferred = CompletableDeferred<String>()
        pendingCode = deferred
        activeCodeVerifier = verifier

        StoryLog.i("Telegram OAuth start clientId=$botId redirect=$redirect url=${startUrl.take(160)}")

        withContext(Dispatchers.Main) {
            val intent = Intent(activity, TelegramOAuthActivity::class.java)
                .putExtra(TelegramOAuthActivity.EXTRA_AUTH_URL, startUrl)
            activity.startActivity(intent)
        }

        return try {
            val code = deferred.await()
            StoryLog.i("Telegram OAuth callback code_len=${code.length}")
            code to verifier
        } catch (e: TelegramOAuthException) {
            throw e
        } catch (e: Exception) {
            throw TelegramOAuthException.Failed(e.message ?: "Ошибка Telegram OAuth")
        } finally {
            pendingCode = null
            activeCodeVerifier = null
        }
    }

    fun handleCallback(uri: Uri?): Boolean {
        if (uri == null) return false
        if (uri.scheme != CALLBACK_SCHEME || uri.host != CALLBACK_HOST) return false
        val path = uri.path.orEmpty()
        if (!path.startsWith(CALLBACK_PATH)) return false

        val deferred = pendingCode ?: return true

        uri.getQueryParameter("error")?.takeIf { it.isNotBlank() }?.let { error ->
            StoryLog.e("Telegram OAuth error=$error")
            deferred.completeExceptionally(TelegramOAuthException.Failed(error))
            pendingCode = null
            activeCodeVerifier = null
            return true
        }

        val code = uri.getQueryParameter("code")?.trim().orEmpty()
        if (code.isEmpty()) {
            StoryLog.e("Telegram OAuth callback missing code uri=$uri")
            deferred.completeExceptionally(TelegramOAuthException.MissingCode)
            pendingCode = null
            activeCodeVerifier = null
            return true
        }

        deferred.complete(code)
        return true
    }

    fun cancelPending() {
        pendingCode?.completeExceptionally(TelegramOAuthException.Cancelled)
        pendingCode = null
        activeCodeVerifier = null
    }

    /**
     * Prefer BFF /authorize (server 302 → Telegram with full query).
     * Direct oauth.telegram.org from Custom Tabs breaks on Huawei (drops redirect_uri).
     */
    private fun buildStartUrl(
        backendBaseUrl: String,
        clientId: String,
        redirectUri: String,
        challenge: String,
    ): String {
        val base = backendBaseUrl.trim().trimEnd('/')
        if (base.startsWith("http", ignoreCase = true)) {
            return Uri.parse("$base/v1/public/oauth/telegram/authorize")
                .buildUpon()
                .appendQueryParameter("code_challenge", challenge)
                .appendQueryParameter("code_challenge_method", "S256")
                .build()
                .toString()
        }
        return buildDirectAuthUri(clientId, redirectUri, challenge).toString()
    }

    private fun buildDirectAuthUri(clientId: String, redirectUri: String, challenge: String): Uri {
        val enc = StandardCharsets.UTF_8
        fun enc(v: String) = URLEncoder.encode(v, enc.name())
        val url = buildString {
            append(AUTH_URL)
            append("?client_id=").append(enc(clientId))
            append("&redirect_uri=").append(enc(redirectUri))
            append("&response_type=code")
            append("&scope=").append(enc("openid profile"))
            append("&code_challenge=").append(challenge)
            append("&code_challenge_method=S256")
        }
        return Uri.parse(url)
    }

    private fun makeCodeVerifier(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return base64UrlEncode(bytes)
    }

    private fun makeCodeChallenge(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.UTF_8))
        return base64UrlEncode(digest)
    }

    private fun base64UrlEncode(data: ByteArray): String =
        android.util.Base64.encodeToString(data, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP)
            .replace("=", "")

    companion object {
        val instance = TelegramOAuthCoordinator()

        /** Must match BotFather OAuth redirect + backend callback-bridge. */
        const val DEFAULT_REDIRECT_URI =
            "https://www.efir-ai.ru/v1/public/oauth/telegram/callback-bridge"

        fun resolveRedirectUri(fromConfig: String?): String =
            fromConfig?.trim()?.takeIf { it.isNotBlank() } ?: DEFAULT_REDIRECT_URI

        private const val AUTH_URL = "https://oauth.telegram.org/auth"
        private const val CALLBACK_SCHEME = "efirai"
        private const val CALLBACK_HOST = "oauth"
        private const val CALLBACK_PATH = "/telegram"
    }
}

sealed class TelegramOAuthException(message: String) : Exception(message) {
    data object Cancelled : TelegramOAuthException("Вход через Telegram отменён")
    data object MissingCode : TelegramOAuthException("Не удалось получить код Telegram")
    class Failed(message: String) : TelegramOAuthException(message)
}
