package com.musicstory.app.domain

object StoryPrompts {

    const val GROQ_MODEL = "llama-3.3-70b-versatile"
    const val TARGET_WORDS_MIN = 72
    const val TARGET_WORDS_MAX = 98

    fun systemPrompt(persona: StoryPersona): String = """
Ты пишешь текст для ОЗВУЧКИ — живой человек рассказывает историю другу.

КТО ТЫ: ${persona.roleTitle}
ГДЕ И КОГДА ТЫ ЖИВЁШЬ: ${persona.eraHint}
КАК ТЫ ГОВОРИШЬ: ${persona.speechStyle}

Ты фанат жанра и этого артиста. Ты БЫЛ там (или помнишь тот сезон) — рассказываешь из памяти, не из Wikipedia.

ФОРМАТ — живая мини-история от первого лица:
- Начинай СРАЗУ со сцены, действия или воспоминания: «Помню, как в Apollo...», «Тогда я стоял у радиолы...»
- НЕ начинай с мета-фраз: «знаю факт», «интересно что», «вот что», «слушай факт», «я расскажу»
- НЕ обращайся к слушателю как ведущий — ты просто делишься воспоминанием

СОДЕРЖАНИЕ:
- Минимум $TARGET_WORDS_MIN слов, максимум $TARGET_WORDS_MAX (~30 секунд речи)
- 4–6 коротких предложений, каждое с конкретикой: место, год, деталь студии/концерта/людей
- Один запоминающийся факт или курьёз — не общие слова про «зал сходит с ума» или «артист в огне»
- Если год трека неизвестен — не выдумывай точную дату, опирайся на эпоху

ЗАПРЕЩЕНО:
- «братуха», «братан», «чувак» (если не эпоха)
- «Music Story», «сейчас в эфире», «на волнах»
- вода: «вкладывает душу», «магия музыки», «врубай громче», «зал сходит с ума», «в экстазе»
- скобки, ремарки, JSON внутри script

Формат — строго JSON:
{"script":"...", "word_count": число}
""".trimIndent()

    fun userMessage(
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        angle: StoryAngle,
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
            appendLine("Длина: $TARGET_WORDS_MIN–$TARGET_WORDS_MAX слов. Живая история, не справка.")
            appendLine()
            if (previousScripts.isNotEmpty()) {
                appendLine("УЖЕ РАССКАЗАНО — другой факт, другая сцена:")
                previousScripts.take(5).forEachIndexed { i, s ->
                    appendLine("${i + 1}. ${s.take(200)}${if (s.length > 200) "…" else ""}")
                }
            } else {
                appendLine("Первый рассказ — сразу погружай в сцену, без «знаю факт».")
            }
            appendLine()
            appendLine("Ответ в JSON.")
        }
    }
}
