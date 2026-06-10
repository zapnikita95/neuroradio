package com.musicstory.app.domain

import java.util.Locale

enum class AppLanguage(val id: String) {
    SYSTEM("system"),
    RU("ru"),
    EN("en"),
    ;

    companion object {
        fun fromId(id: String?): AppLanguage =
            entries.firstOrNull { it.id == id?.trim() } ?: SYSTEM
    }
}

enum class ResolvedAppLanguage { RU, EN }

fun resolveAppLanguage(stored: AppLanguage, device: Locale = Locale.getDefault()): ResolvedAppLanguage =
    when (stored) {
        AppLanguage.SYSTEM ->
            if (device.language.equals("ru", ignoreCase = true)) ResolvedAppLanguage.RU
            else ResolvedAppLanguage.EN
        AppLanguage.RU -> ResolvedAppLanguage.RU
        AppLanguage.EN -> ResolvedAppLanguage.EN
    }

fun ResolvedAppLanguage.toApiCode(): String = when (this) {
    ResolvedAppLanguage.RU -> "ru"
    ResolvedAppLanguage.EN -> "en"
}

fun ResolvedAppLanguage.toLocale(): Locale = when (this) {
    ResolvedAppLanguage.RU -> Locale("ru")
    ResolvedAppLanguage.EN -> Locale.ENGLISH
}
