package com.musicstory.app.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.musicstory.app.util.ApiKeySanitizer

/**
 * API keys at rest on device — Android Keystore + EncryptedSharedPreferences.
 */
class SecureApiKeyStore(context: Context) {

    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

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

    companion object {
        private const val PREFS_NAME = "secure_api_keys"
        const val GROQ = "groq_api_key"
        const val GEMINI = "gemini_api_key"
        const val OPENROUTER = "openrouter_api_key"
        const val YANDEX = "yandex_api_key"
        const val SALUTE = "salute_auth_key"
        const val TRANSPORT = "secrets_transport_key"
    }
}
