package com.musicstory.app.domain

object StoryPrompts {

    const val GROQ_MODEL_PRIMARY = "llama-3.1-8b-instant"
    val GROQ_MODELS = listOf(GROQ_MODEL_PRIMARY)

    /** @deprecated use GROQ_MODEL_PRIMARY */
    const val GROQ_MODEL = GROQ_MODEL_PRIMARY

    fun systemPrompt(persona: StoryPersona, length: StoryLength): String {
        val durationHint = if (length == StoryLength.UNLIMITED) {
            "развёрнутый рассказ"
        } else {
            length.labelRu
        }
        val formatBlock = persona.formatRules?.takeIf { it.isNotBlank() }
            ?: "Начинай СРАЗУ со сцены. НЕ обращайся к слушателю как ведущий — ты делишься воспоминанием."
        val focusBlock = persona.contentFocus?.takeIf { it.isNotBlank() }
            ?.let { "ФОКУС СОДЕРЖАНИЯ: $it" }
            ?: "Один запоминающийся факт — не «зал сходит с ума», не «артист в огне»"

        return """
Ты пишешь текст для ОЗВУЧКИ — живой человек рассказывает историю.

КТО ТЫ: ${persona.roleTitle}
КОНТЕКСТ ЭПОХИ: ${persona.eraHint}
КАК ТЫ ГОВОРИШЬ: ${persona.speechStyle}
$focusBlock

ЯЗЫК: только русский. Английский допустим ТОЛЬКО в именах артистов и названиях песен.

ЛОКАЛЬ И ЭПОХА:
- История должна совпадать со страной происхождения трека и его реальной эпохой
- Российский современный трек — не «радиола», не Apollo, не Nashville
- Если год неизвестен, не выдумывай винтаж — ориентируйся на сцену страны артиста

ЧИСЛА — КРИТИЧНО:
- В script НЕЛЬЗЯ писать цифры, годы, «N-й», «шестидесятых» и т.п.
- Исключение: цифры только из имени артиста или названия трека (2Pac, «1999»)
- Вместо дат: «тогда», «в те годы», «на заре», «однажды на концерте», «в студии»

ФОРМАТ:
- $formatBlock
- НЕ начинай: «знаю факт», «интересно что», «вот что», «слушай факт»

СОДЕРЖАНИЕ:
- ${length.wordsMin}–${length.wordsMax} слов ($durationHint)
- ${length.sentenceHint}, каждое с конкретикой: место, люди, звук, запах

ЗАПРЕЩЕНО:
- цифры и даты (кроме имени/названия)
- английские слова, кроме имён артистов и названий треков в «кавычках»
- «братуха», «Music Story», «сейчас в эфире»
- вода: «влияет на музыку», «легендарная», «уникальный пример», «суть в том что», «понял что музыка», «соединяет всех»
- «он подсказывает [имя артиста]» — имя сцены не объект; говори «артист», «он», или ««имя»»

ОБЯЗАТЕЛЬНО:
- один конкретный факт из ОПОРНЫЕ ФАКТЫ — sample, кавер, скандал, инструмент, лейбл
- первое предложение — факт или действие, не «я сидел в студии»

JSON: {"script":"...", "word_count": число}
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
        narrator: StoryNarrator = StoryNarrator.AUTO,
        countryCode: String? = null,
        referenceFacts: List<String> = emptyList(),
    ): String {
        val locale = TrackLocaleResolver.resolve(artist, title, year, genre, countryCode)
        val persona = StoryNarrator.buildPersona(narrator, year, genre, artist, title, countryCode)
        return buildString {
            appendLine("Артист: $artist")
            appendLine("Трек: $title")
            genre?.let { appendLine("Жанр: $it") }
            appendLine("Страна/сцена: ${locale.countryLabelRu}")
            appendLine("Год релиза (только для тебя, НЕ писать цифры в script): ${locale.yearLabelRu}")
            appendLine("Эпоха и контекст: ${locale.sceneHintRu}")
            appendLine("ЛОКАЛЬ: ${locale.localeRulesRu}")
            appendLine()
            appendLine("УГОЛ ИСТОРИИ: ${angle.labelRu}")
            appendLine("Ты — ${persona.roleTitle}. Говоришь так: ${persona.speechStyle}")
            if (!narrator.isAuto) {
                appendLine("РЕЖИМ РАССКАЗЧИКА: ${narrator.labelRu} — ${narrator.descriptionRu}")
            }
            appendLine("Длина: ${length.wordsMin}–${length.wordsMax} слов.")
            appendLine("Помни: в script никаких цифр и годов, кроме цифр из имени артиста или названия трека.")
            if (referenceFacts.isNotEmpty()) {
                appendLine()
                appendLine("ОПОРНЫЕ ФАКТЫ (выбери один, встрой в сцену — не пересказывай списком):")
                referenceFacts.take(4).forEachIndexed { i, fact ->
                    appendLine("${i + 1}. $fact")
                }
            }
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
