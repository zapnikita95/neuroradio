package com.musicstory.app.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.musicstory.app.util.ApiKeySanitizer
import com.musicstory.app.util.StoryLog

/**
 * API keys at rest on device — Android Keystore + EncryptedSharedPreferences.
 * Falls back to plain prefs if Keystore/encryption fails (common on some MIUI builds).
 */
class SecureApiKeyStore(context: Context) {

    private val appContext = context.applicationContext
    private val encryptedFailed: Boolean
    private val prefs: SharedPreferences

    init {
        var failed = false
        var store: SharedPreferences? = null
        try {
            store = EncryptedSharedPreferences.create(
                appContext,
                PREFS_NAME,
                MasterKey.Builder(appContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            failed = true
            StoryLog.w(
                "SecureApiKeyStore: encrypted storage unavailable (${e.javaClass.simpleName}: ${e.message}) — plain fallback",
            )
        }
        encryptedFailed = failed
        prefs = store ?: appContext.getSharedPreferences(PREFS_NAME_FALLBACK, Context.MODE_PRIVATE)
    }

    fun read(name: String, legacyPlain: String? = null): String {
        val stored = prefs.getString(name, null)?.trim().orEmpty()
        if (stored.isNotBlank()) return stored
        val legacy = ApiKeySanitizer.clean(legacyPlain.orEmpty())
        if (legacy.isNotBlank()) {
            prefs.edit().putString(name, legacy).apply()
        }
        return legacy
    }

    fun write(name: String, value: String) {
        val clean = ApiKeySanitizer.clean(value)
        prefs.edit().putString(name, clean).apply()
    }

    fun clear(name: String) {
        prefs.edit().remove(name).apply()
    }

    fun usesPlainFallback(): Boolean = encryptedFailed

    companion object {
        private const val PREFS_NAME = "secure_api_keys"
        private const val PREFS_NAME_FALLBACK = "secure_api_keys_plain"
        const val GROQ = "groq_api_key"
        const val GEMINI = "gemini_api_key"
        const val OPENROUTER = "openrouter_api_key"
        const val YANDEX = "yandex_api_key"
        const val SALUTE = "salute_auth_key"
        const val TRANSPORT = "secrets_transport_key"
    }
}
