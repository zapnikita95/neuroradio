package com.musicstory.app.domain

import java.util.Locale

/**
 * Splits mixed RU/EN story scripts so Android TTS can speak Latin with en-US voice.
 */
object TtsScriptSegmenter {

    enum class Lang { RU, EN }

    data class Segment(val text: String, val lang: Lang)

    private val TOKEN = Regex(
        "([A-Za-z][A-Za-z0-9'.-]*)|([\\u0400-\\u04FF]+)|(\\s+|[^\\sA-Za-z\\u0400-\\u04FF]+)",
    )

    fun split(script: String): List<Segment> {
        if (script.isBlank()) return emptyList()

        val merged = mutableListOf<Segment>()
        for (match in TOKEN.findAll(script)) {
            val token = match.value
            if (token.isEmpty()) continue

            val lang = when {
                match.groupValues[1].isNotEmpty() -> Lang.EN
                else -> Lang.RU
            }

            if (merged.isNotEmpty() && merged.last().lang == lang) {
                val last = merged.removeAt(merged.lastIndex)
                merged.add(Segment(last.text + token, lang))
            } else {
                merged.add(Segment(token, lang))
            }
        }

        return merged.filter { it.text.isNotBlank() }
    }

    fun localeFor(lang: Lang): Locale = when (lang) {
        Lang.RU -> Locale("ru", "RU")
        Lang.EN -> Locale.US
    }
}
