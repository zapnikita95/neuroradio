package com.musicstory.app.security

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.musicstory.app.util.ApiKeySanitizer
import com.musicstory.app.util.StoryLog
import java.io.File

/**
 * API keys at rest on device — Android Keystore + EncryptedSharedPreferences.
 * Falls back to plain prefs if Keystore/encryption fails (common on Huawei/MIUI after OEM security scan).
 */
class SecureApiKeyStore(context: Context) {

    private val appContext = context.applicationContext
    @Volatile
    private var usePlainFallback: Boolean = oemPrefersPlainStorage()
    private var prefs: SharedPreferences = openPrefs()

    init {
        if (usePlainFallback) {
            StoryLog.w("SecureApiKeyStore: plain storage (OEM ${Build.MANUFACTURER} or prior fallback)")
        }
    }

    fun read(name: String, legacyPlain: String? = null): String {
        return runCatching {
            val stored = prefs.getString(name, null)?.trim().orEmpty()
            if (stored.isNotBlank()) return stored
            val legacy = ApiKeySanitizer.clean(legacyPlain.orEmpty())
            if (legacy.isNotBlank()) {
                write(name, legacy)
            }
            legacy
        }.getOrElse { err ->
            StoryLog.w("SecureApiKeyStore read failed for $name — plain fallback", err)
            switchToPlainFallback()
            val legacy = ApiKeySanitizer.clean(legacyPlain.orEmpty())
            if (legacy.isNotBlank()) {
                runCatching { prefs.edit().putString(name, legacy).apply() }
            }
            legacy
        }
    }

    fun write(name: String, value: String) {
        val clean = ApiKeySanitizer.clean(value)
        runCatching {
            prefs.edit().putString(name, clean).apply()
        }.onFailure { err ->
            StoryLog.w("SecureApiKeyStore write failed for $name — plain fallback", err)
            switchToPlainFallback()
            runCatching { prefs.edit().putString(name, clean).apply() }
        }
    }

    fun clear(name: String) {
        runCatching { prefs.edit().remove(name).apply() }
            .onFailure { err ->
                StoryLog.w("SecureApiKeyStore clear failed for $name", err)
                switchToPlainFallback()
                runCatching { prefs.edit().remove(name).apply() }
            }
    }

    fun usesPlainFallback(): Boolean = usePlainFallback

    private fun openPrefs(): SharedPreferences {
        if (usePlainFallback) {
            return appContext.getSharedPreferences(PREFS_NAME_FALLBACK, Context.MODE_PRIVATE)
        }
        return try {
            EncryptedSharedPreferences.create(
                appContext,
                PREFS_NAME,
                MasterKey.Builder(appContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            usePlainFallback = true
            StoryLog.w(
                "SecureApiKeyStore: encrypted storage unavailable (${e.javaClass.simpleName}: ${e.message}) — plain fallback",
            )
            appContext.getSharedPreferences(PREFS_NAME_FALLBACK, Context.MODE_PRIVATE)
        }
    }

    private fun switchToPlainFallback() {
        if (usePlainFallback) return
        usePlainFallback = true
        dropCorruptedEncryptedPrefs()
        prefs = appContext.getSharedPreferences(PREFS_NAME_FALLBACK, Context.MODE_PRIVATE)
        StoryLog.w("SecureApiKeyStore: switched to plain fallback after runtime crypto failure")
    }

    private fun dropCorruptedEncryptedPrefs() {
        runCatching {
            val dir = File(appContext.applicationInfo.dataDir, "shared_prefs")
            listOf(PREFS_NAME, "$PREFS_NAME.xml").forEach { name ->
                File(dir, name).takeIf { it.exists() }?.delete()
            }
        }.onFailure { err ->
            StoryLog.w("SecureApiKeyStore: could not drop encrypted prefs", err)
        }
    }

    companion object {
        private const val PREFS_NAME = "secure_api_keys"
        private const val PREFS_NAME_FALLBACK = "secure_api_keys_plain"

        const val GROQ = "groq_api_key"
        const val GEMINI = "gemini_api_key"
        const val OPENROUTER = "openrouter_api_key"
        const val YANDEX = "yandex_api_key"
        const val SALUTE = "salute_auth_key"
        const val TRANSPORT = "secrets_transport_key"

        /** Huawei/MIUI/Oppo often invalidate Keystore after an OEM "security check" mid-session. */
        private fun oemPrefersPlainStorage(): Boolean {
            val brand = Build.BRAND.orEmpty().lowercase()
            val manufacturer = Build.MANUFACTURER.orEmpty().lowercase()
            val oemHints = setOf(
                "huawei", "honor", "xiaomi", "redmi", "poco", "oppo", "realme", "vivo", "iqoo", "oneplus",
            )
            return oemHints.any { hint -> brand.contains(hint) || manufacturer.contains(hint) }
        }
    }
}
