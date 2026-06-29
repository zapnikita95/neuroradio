package com.musicstory.app.media

object MediaJunkFilter {

    private const val YOUTUBE_MUSIC = "com.google.android.apps.youtube.music"

    private val YTM_SUBSCRIPTION_PROMO = Regex(
        """(?i)(оформ(ите|ить)\s+подписк|subscribe\s+to|get\s+|try\s+).*youtube\s*music|youtube\s*music.*(подписк|subscription|premium|free\s+trial)""",
    )

    private val VOICE_MESSAGE_PATTERNS = listOf(
        "voice message",
        "voice note",
        "voice msg",
        "audio message",
        "vocal message",
        "video message",
        "голосовое сообщение",
        "голосовое",
        "голосовая заметка",
        "аудиосообщение",
        "аудио сообщение",
        "аудиозаметка",
    )

    /** Voice messages from Telegram, Messages, WhatsApp, etc. — not music. */
    fun isNonMusicPlaybackMetadata(artist: String, title: String): Boolean {
        return matchesVoiceMessagePattern(artist) || matchesVoiceMessagePattern(title)
    }

    private fun matchesVoiceMessagePattern(value: String): Boolean {
        val normalized = value.trim().lowercase().replace(Regex("\\s+"), " ")
        if (normalized.isBlank()) return false
        return VOICE_MESSAGE_PATTERNS.any { pattern ->
            normalized == pattern || normalized.startsWith("$pattern ")
        }
    }

    fun isJunkNotification(
        packageName: String,
        title: String?,
        text: String?,
        subText: String?,
    ): Boolean {
        val normalizedTitle = title?.trim().orEmpty()
        if (normalizedTitle.isBlank()) return false
        val artistHint = (text ?: subText)?.trim().orEmpty()
        if (isNonMusicPlaybackMetadata(artistHint, normalizedTitle)) return true
        if (packageName != YOUTUBE_MUSIC) {
            return isJunkTrack(packageName, artistHint, normalizedTitle)
        }
        if (YTM_SUBSCRIPTION_PROMO.containsMatchIn(normalizedTitle)) return true
        if (artistHint.equals("music", ignoreCase = true) &&
            normalizedTitle.contains("youtube", ignoreCase = true)
        ) {
            return true
        }
        return isJunkTrack(packageName, artistHint, normalizedTitle)
    }

    fun isJunkTrack(packageName: String?, artist: String, title: String): Boolean {
        if (isNonMusicPlaybackMetadata(artist, title)) return true
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
