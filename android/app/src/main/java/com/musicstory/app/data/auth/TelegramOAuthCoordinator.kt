package com.musicstory.app.data.auth

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
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
        val startUrl = buildStartUrl(redirect, challenge)

        val deferred = CompletableDeferred<String>()
        pendingCode = deferred
        activeCodeVerifier = verifier

        StoryLog.i("Telegram OAuth start clientId=$botId redirect=$redirect url=${startUrl.take(160)}")

        withContext(Dispatchers.Main) {
            if (!launchCustomTab(activity, startUrl)) {
                StoryLog.w("Telegram OAuth Custom Tab unavailable — falling back to WebView")
                val intent = Intent(activity, TelegramOAuthActivity::class.java)
                    .putExtra(TelegramOAuthActivity.EXTRA_AUTH_URL, startUrl)
                activity.startActivity(intent)
            }
        }

        return try {
            val code = withTimeout(OAUTH_TIMEOUT_MS) { deferred.await() }
            StoryLog.i("Telegram OAuth callback code_len=${code.length}")
            code to verifier
        } catch (e: TelegramOAuthException) {
            throw e
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            cancelPending()
            throw TelegramOAuthException.Cancelled
        } catch (e: Exception) {
            throw TelegramOAuthException.Failed(e.message ?: "Ошибка Telegram OAuth")
        } finally {
            pendingCode = null
            activeCodeVerifier = null
        }
    }

    /** Chrome Custom Tab — oauth.telegram.org renders correctly (Huawei WebView often black screen). */
    private fun launchCustomTab(activity: Activity, url: String): Boolean {
        return try {
            val uri = Uri.parse(url)
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setUrlBarHidingEnabled(false)
                .build()
                .launchUrl(activity, uri)
            StoryLog.i("Telegram OAuth opened Custom Tab")
            true
        } catch (e: Exception) {
            StoryLog.w("Telegram OAuth Custom Tab failed: ${e.message}")
            false
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
     * Always efir-ai.ru for OAuth — API may go to Railway, but Custom Tabs must open our domain
     * (BotFather redirect URI + HTML bridge). Railway URL in browser breaks OAuth on Huawei.
     */
    private fun buildStartUrl(redirectUri: String, challenge: String): String {
        val uri = Uri.parse(redirectUri.trim())
        val host = uri.host?.takeIf { it.isNotBlank() } ?: "www.efir-ai.ru"
        val scheme = uri.scheme?.takeIf { it.isNotBlank() } ?: "https"
        val base = "$scheme://$host".trimEnd('/')
        val enc = URLEncoder.encode(challenge, StandardCharsets.UTF_8.name())
        return "$base/v1/public/oauth/telegram/authorize?code_challenge=$enc&code_challenge_method=S256"
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

        private const val CALLBACK_SCHEME = "efirai"
        private const val CALLBACK_HOST = "oauth"
        private const val CALLBACK_PATH = "/telegram"
        private const val OAUTH_TIMEOUT_MS = 5 * 60 * 1000L
    }
}

sealed class TelegramOAuthException(message: String) : Exception(message) {
    data object Cancelled : TelegramOAuthException("Вход через Telegram отменён")
    data object MissingCode : TelegramOAuthException("Не удалось получить код Telegram")
    class Failed(message: String) : TelegramOAuthException(message)
}
