package com.musicstory.app.util

import android.content.Context
import android.content.res.Configuration
import androidx.datastore.preferences.core.stringPreferencesKey
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.domain.AppLanguage
import com.musicstory.app.domain.resolveAppLanguage
import com.musicstory.app.domain.toLocale
import java.util.Locale

object LocaleHelper {
    private val KEY_APP_LANGUAGE = stringPreferencesKey("app_language")

    fun readStoredLanguage(context: Context): AppLanguage {
        return try {
            val prefs = context.getSharedPreferences("settings_data_store_fallback", Context.MODE_PRIVATE)
            val raw = prefs.getString("app_language_sync", null)
            AppLanguage.fromId(raw)
        } catch (_: Exception) {
            AppLanguage.SYSTEM
        }
    }

    fun wrapContext(base: Context, language: AppLanguage): Context {
        val resolved = resolveAppLanguage(language)
        val locale = resolved.toLocale()
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }

    /** Call after DataStore language change to keep attachBaseContext in sync on cold start. */
    fun persistLanguageForBoot(context: Context, language: AppLanguage) {
        context.getSharedPreferences("settings_data_store_fallback", Context.MODE_PRIVATE)
            .edit()
            .putString("app_language_sync", language.id)
            .apply()
    }
}
