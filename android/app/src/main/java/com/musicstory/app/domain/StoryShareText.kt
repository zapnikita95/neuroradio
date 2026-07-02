package com.musicstory.app.domain

import com.musicstory.app.data.model.StoryResponse

object StoryShareText {
    fun normalizeUserFacingTranscript(text: String): String =
        text
            .replace(Regex("""й\+?утй\+?уб""", RegexOption.IGNORE_CASE), "YouTube")
            .replace(Regex("""ют\+?уб""", RegexOption.IGNORE_CASE), "YouTube")
            .trim()

    fun resolveVoicedText(script: String, ttsTranscript: String? = null): String {
        val raw = ttsTranscript?.trim()?.takeIf { it.isNotEmpty() } ?: script.trim()
        return normalizeUserFacingTranscript(raw)
    }

    fun resolveVoicedText(response: StoryResponse): String =
        resolveVoicedText(response.script, response.ttsTranscript)

    fun excerpt(text: String, maxChars: Int = 280): String {
        val t = text.trim()
        if (t.length <= maxChars) return t
        val cut = t.take(maxChars)
        val lastSentence = cut.lastIndexOf('.').takeIf { it > maxChars / 3 } ?: cut.lastIndexOf(' ')
        return if (lastSentence > 0) cut.take(lastSentence + 1).trim() + "…" else cut.trim() + "…"
    }

    fun plainShareMessage(artist: String, title: String, voicedText: String): String =
        buildString {
            appendLine("$title — $artist")
            appendLine()
            appendLine(voicedText.trim())
            appendLine()
            append("— Эфир AI · https://www.efir-ai.ru")
        }

    fun cardVariantSeed(trackKey: String, playedAt: Long): Int {
        val hash = (trackKey + playedAt).hashCode()
        return (hash and Int.MAX_VALUE) % 4
    }
}
