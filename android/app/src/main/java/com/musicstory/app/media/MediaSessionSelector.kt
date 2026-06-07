package com.musicstory.app.media

object MediaSessionSelector {

    /** Music apps we track — Yandex first; Spotify last (empty ghost sessions). */
    val PREFERRED_PACKAGES = listOf(
        "ru.yandex.music",
        "com.yandex.music",
        "com.apple.android.music",
        "com.google.android.apps.youtube.music",
        "com.spotify.music",
    )

    /** Video / non-music — never bind or parse notifications. */
    val BLOCKED_PACKAGES = setOf(
        "com.google.android.youtube",
        "com.google.android.apps.youtube",
        "com.google.android.youtube.tv",
        "com.vanced.android.youtube",
        "app.revanced.android.youtube",
    )

    private val PREFERRED_PREFIXES = listOf(
        "ru.yandex.music",
        "com.yandex.music",
    )

    fun isAllowedMusicPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        return !isBlockedPackage(packageName) && isPreferredPackage(packageName)
    }

    fun isBlockedPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        if (BLOCKED_PACKAGES.contains(packageName)) return true
        return packageName.startsWith("com.google.android.youtube") &&
            !packageName.contains("youtube.music")
    }

    fun isPreferredPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        if (isBlockedPackage(packageName)) return false
        return PREFERRED_PACKAGES.any { it == packageName } ||
            PREFERRED_PREFIXES.any { packageName.startsWith(it) }
    }

    fun priority(packageName: String?): Int {
        if (packageName.isNullOrBlank()) return Int.MAX_VALUE
        val index = PREFERRED_PACKAGES.indexOf(packageName)
        return if (index >= 0) index else Int.MAX_VALUE - 1
    }

    fun selectBestPackage(candidates: Collection<String>): String? {
        return candidates
            .filter { isPreferredPackage(it) }
            .minByOrNull { priority(it) }
    }
}
