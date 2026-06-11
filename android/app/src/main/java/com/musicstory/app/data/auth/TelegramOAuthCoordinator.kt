package com.musicstory.app.data.auth

import android.app.Activity
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.MessageDigest
import java.security.SecureRandom

class TelegramOAuthCoordinator private constructor() {

    private var pendingCode: CompletableDeferred<String>? = null
    private var activeCodeVerifier: String? = null

    suspend fun signIn(activity: Activity, clientId: String, redirectUri: String): Pair<String, String> {
        cancelPending()

        val verifier = makeCodeVerifier()
        val challenge = makeCodeChallenge(verifier)
        val authUri = Uri.parse(AUTH_URL).buildUpon()
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("redirect_uri", redirectUri)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("scope", "openid profile")
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "S256")
            .build()

        val deferred = CompletableDeferred<String>()
        pendingCode = deferred
        activeCodeVerifier = verifier

        StoryLog.i("Telegram OAuth start clientId=$clientId redirect=$redirectUri")

        withContext(Dispatchers.Main) {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(activity, authUri)
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
