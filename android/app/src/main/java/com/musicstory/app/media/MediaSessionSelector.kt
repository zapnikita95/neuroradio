package com.musicstory.app.media

object MediaSessionSelector {

    val PREFERRED_PACKAGES = listOf(
        "com.spotify.music",
        "ru.yandex.music",
        "com.yandex.music",
        "com.google.android.apps.youtube.music",
        "com.apple.android.music",
    )

    private val PREFERRED_PREFIXES = listOf(
        "ru.yandex.music",
        "com.yandex.music",
        "com.spotify.music",
    )

    fun isPreferredPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
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
