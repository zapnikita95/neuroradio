package com.musicstory.app.domain

object StoryScriptQuality {

    private val templatePatterns = listOf(
        Regex("""стоял у мониторов,\s*звукорежиссёры краснели""", RegexOption.IGNORE_CASE),
        Regex("""зал замолчал на первой ноте""", RegexOption.IGNORE_CASE),
        Regex("""стоял у радиолы""", RegexOption.IGNORE_CASE),
        Regex("""помню студию — при записи""", RegexOption.IGNORE_CASE),
        Regex("""фанат\s+\S+\s+настояли""", RegexOption.IGNORE_CASE),
        Regex("""микрофон еле остыл""", RegexOption.IGNORE_CASE),
        Regex("""прилетел из плейлиста, друзья пересылали в Telegram""", RegexOption.IGNORE_CASE),
    )

    fun isTemplateLike(script: String): Boolean {
        val text = script.trim()
        if (text.isBlank()) return true
        return templatePatterns.any { it.containsMatchIn(text) }
    }
}
