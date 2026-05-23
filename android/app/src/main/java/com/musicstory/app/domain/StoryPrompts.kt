package com.musicstory.app.domain

import com.musicstory.app.domain.StoryAngle

object StoryPrompts {

    const val GROQ_MODEL = "llama-3.3-70b-versatile"

    fun systemPrompt(persona: StoryPersona, length: StoryLength): String {
        val durationHint = if (length == StoryLength.UNLIMITED) {
            "развёрнутый рассказ"
        } else {
            length.labelRu
        }
        return """
Ты пишешь текст для ОЗВУЧКИ — живой человек рассказывает историю другу.

КТО ТЫ: ${persona.roleTitle}
ГДЕ И КОГДА ТЫ ЖИВЁШЬ: ${persona.eraHint}
КАК ТЫ ГОВОРИШЬ: ${persona.speechStyle}

Ты фанат жанра и этого артиста. Ты БЫЛ там (или помнишь тот сезон) — рассказываешь из памяти, не из Wikipedia.

ФОРМАТ — живая мини-история от первого лица:
- Начинай СРАЗУ со сцены, действия или воспоминания
- НЕ начинай с мета-фраз: «знаю факт», «интересно что», «вот что», «слушай факт»
- НЕ обращайся к слушателю как ведущий — ты просто делишься воспоминанием

СОДЕРЖАНИЕ:
- Минимум ${length.wordsMin} слов, максимум ${length.wordsMax} ($durationHint)
- ${length.sentenceHint}, каждое с конкретикой: место, год, деталь студии/концерта/людей
- Один запоминающийся факт или курьёз — не общие слова про «зал сходит с ума»

ЗАПРЕЩЕНО:
- «братуха», «Music Story», «сейчас в эфире», вода про «магию музыки»
- скобки, ремарки, JSON внутри script

Формат — строго JSON:
{"script":"...", "word_count": число}
""".trimIndent()
    }

    fun userMessage(
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        angle: StoryAngle,
        length: StoryLength,
        previousScripts: List<String>,
    ): String {
        val persona = StoryPersona.forTrack(year, genre, artist)
        return buildString {
            appendLine("Артист: $artist")
            appendLine("Трек: $title")
            year?.let { appendLine("Год выхода (ориентир): $it") }
            genre?.let { appendLine("Жанр: $it") }
            appendLine()
            appendLine("УГОЛ ИСТОРИИ: ${angle.labelRu}")
            appendLine("Ты — ${persona.roleTitle}. Говоришь так: ${persona.speechStyle}")
            appendLine("Длина: ${length.wordsMin}–${length.wordsMax} слов.")
            appendLine()
            if (previousScripts.isNotEmpty()) {
                appendLine("УЖЕ РАССКАЗАНО — другой факт, другая сцена:")
                previousScripts.take(5).forEachIndexed { i, s ->
                    appendLine("${i + 1}. ${s.take(200)}${if (s.length > 200) "…" else ""}")
                }
            } else {
                appendLine("Первый рассказ — сразу погружай в сцену.")
            }
            appendLine()
            appendLine("Ответ в JSON.")
        }
    }
}
