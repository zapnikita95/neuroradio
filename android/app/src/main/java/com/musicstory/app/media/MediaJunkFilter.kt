package com.musicstory.app.media

object MediaJunkFilter {

    private const val YOUTUBE_MUSIC = "com.google.android.apps.youtube.music"

    private val YTM_SUBSCRIPTION_PROMO = Regex(
        """(?i)(оформ(ите|ить)\s+подписк|subscribe\s+to|get\s+|try\s+).*youtube\s*music|youtube\s*music.*(подписк|subscription|premium|free\s+trial)""",
    )

    fun isJunkNotification(
        packageName: String,
        title: String?,
        text: String?,
        subText: String?,
    ): Boolean {
        val normalizedTitle = title?.trim().orEmpty()
        if (normalizedTitle.isBlank()) return false
        if (packageName != YOUTUBE_MUSIC) {
            return isJunkTrack(packageName, text ?: subText ?: "", normalizedTitle)
        }
        if (YTM_SUBSCRIPTION_PROMO.containsMatchIn(normalizedTitle)) return true
        val artistHint = (text ?: subText)?.trim().orEmpty()
        if (artistHint.equals("music", ignoreCase = true) &&
            normalizedTitle.contains("youtube", ignoreCase = true)
        ) {
            return true
        }
        return isJunkTrack(packageName, artistHint, normalizedTitle)
    }

    fun isJunkTrack(packageName: String?, artist: String, title: String): Boolean {
        if (packageName != YOUTUBE_MUSIC) return false
        if (YTM_SUBSCRIPTION_PROMO.containsMatchIn(title)) return true
        if (artist.equals("music", ignoreCase = true) &&
            title.contains("youtube", ignoreCase = true) &&
            title.contains("подписк", ignoreCase = true)
        ) {
            return true
        }
        return false
    }
}
