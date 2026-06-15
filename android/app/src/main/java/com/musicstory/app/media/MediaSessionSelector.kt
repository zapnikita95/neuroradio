package com.musicstory.app.media

object MediaSessionSelector {

    /** Known music apps — higher priority when several sessions are active. */
    val PREFERRED_PACKAGES = listOf(
        "ru.yandex.music",
        "com.yandex.music",
        "com.apple.android.music",
        "com.google.android.apps.youtube.music",
        "com.spotify.music",
    )

    /** Video / streaming — never bind or parse notifications. */
    val BLOCKED_PACKAGES = setOf(
        "com.google.android.youtube",
        "com.google.android.apps.youtube",
        "com.google.android.youtube.tv",
        "com.vanced.android.youtube",
        "app.revanced.android.youtube",
        "com.netflix.mediaclient",
        "com.netflix.ninja",
        "tv.twitch.android.app",
        "org.videolan.vlc",
        "org.videolan.vlc.betav7neon",
        "com.mxtech.videoplayer.ad",
        "com.mxtech.videoplayer.pro",
        "com.amazon.avod.thirdpartyclient",
        "com.disney.disneyplus",
        "com.wbd.stream",
        "ru.rutube.app",
        "com.vk.vkvideo",
        "com.google.android.videos",
        "com.google.android.apps.tv",
    )

    private val PREFERRED_PREFIXES = listOf(
        "ru.yandex.music",
        "com.yandex.music",
    )

    private val BLOCKED_PREFIXES = listOf(
        "com.google.android.youtube",
    )

    /** Any non-blocked media app (NewPipe, local players, etc.) — not only Spotify/Yandex. */
    fun isAllowedMusicPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        if (packageName == "com.musicstory.app") return false
        return !isBlockedPackage(packageName)
    }

    fun isBlockedPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        if (BLOCKED_PACKAGES.contains(packageName)) return true
        if (BLOCKED_PREFIXES.any { prefix ->
                packageName.startsWith(prefix) && !packageName.contains("youtube.music")
            }
        ) {
            return true
        }
        return false
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
        return when {
            index >= 0 -> index
            isAllowedMusicPackage(packageName) -> PREFERRED_PACKAGES.size
            else -> Int.MAX_VALUE
        }
    }

    fun selectBestPackage(candidates: Collection<String>): String? {
        return candidates
            .filter { isAllowedMusicPackage(it) }
            .minByOrNull { priority(it) }
    }

    fun shouldParseNotification(packageName: String, extras: android.os.Bundle): Boolean {
        if (!isAllowedMusicPackage(packageName)) return false
        if (isPreferredPackage(packageName)) return true
        return MediaTrackParser.looksLikeMediaNotification(extras)
    }
}
