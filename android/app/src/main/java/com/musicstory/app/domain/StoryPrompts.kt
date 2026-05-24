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
            ?: "Рассказываешь другу за барной стойкой: факт + метафора + ударная строка."
        val focusBlock = persona.contentFocus?.takeIf { it.isNotBlank() }
            ?.let { "ФОКУС: $it" }
            ?: "Драма и контраст — не сухая статья Wikipedia"
        val lengthPlan = StoryLengthPlan.structurePlan(length)

        return """
Ты пишешь текст для ОЗВУЧКИ — харизматичный музыкальный рассказчик, знаешь изнанку шоу-бизнеса.

РОЛЬ: ${persona.roleTitle}
ЭПОХА: ${persona.eraHint}
ГОЛОС: ${persona.speechStyle}
$focusBlock

РЕЦЕПТ (масштабируй по длительности):
- Факт + метафора + ударная строка.
- Ищи ДРАМУ и КОНТРАСТ: конфликт, прорыв, скандал, возвращение — что люди почувствовали.
- Опорный факт Wikipedia = семя. Не выдумывай людей и события, которых нет в факте.

$lengthPlan

СТИЛЬ: друг за барной стойкой. Можно «слушай», «чувак», «брат». Не Wikipedia.

КАТЕГОРИЧЕСКИ НЕЛЬЗЯ:
- «изначально называлась», «группа из…», состав, дискография.
- Перечисление рекламы, саундтреков, игр, фильмов.
- Generic-студия: «помогаюсь», «команда работает над треком».

ЯЗЫК: только русский. Английский — только внутри «имя артиста» или «название трека».

${StoryRussianLanguage.PROMPT_BLOCK}

ЧИСЛА: без цифр и годов (кроме цифр в имени/названии). Вместо дат: «тогда», «в те годы».

ФОРМАТ:
- $formatBlock
- Не начинай: «знаю факт», «интересно что», «вот что»

ЖЁСТКИЙ ОБЪЁМ: ${length.wordsMin}–${length.wordsMax} слов ($durationHint). ${length.sentenceHint}.
- word_count в JSON — строго в этом диапазоне.

ЗАПРЕЩЕНО: выдуманные люди, «Music Story», вода «магия музыки», «легендарная».

ОБЯЗАТЕЛЬНО: слушатель понимает ПОЧЕМУ это цепляет; суть семени факта узнаваема.

JSON: {"script":"...", "word_count": число}
Верни ТОЛЬКО JSON — без markdown, без текста до или после скобок.
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
        selectedFact: SelectedReferenceFact? = null,
    ): String {
        val locale = TrackLocaleResolver.resolve(artist, title, year, genre, countryCode)
        val persona = StoryNarrator.buildPersona(narrator, year, genre, artist, title, countryCode)
        return buildString {
            appendLine("Артист: $artist")
            appendLine("Трек: $title")
            genre?.let { appendLine("Жанр: $it") }
            appendLine("Страна/сцена: ${locale.countryLabelRu}")
            appendLine("Год (не писать цифрами в script): ${locale.yearLabelRu}")
            appendLine("Эпоха: ${locale.sceneHintRu}")
            appendLine()
            appendLine("УГОЛ ПОДАЧИ: ${angle.labelRu} — ${angle.wrapHint}")
            appendLine("Ты — ${persona.roleTitle}. Говоришь: ${persona.speechStyle}")
            if (!narrator.isAuto) {
                appendLine("РАССКАЗЧИК: ${narrator.labelRu} — ${narrator.formatRules}")
            }
            appendLine("ЖЁСТКАЯ ДЛИНА: ${length.wordsMin}–${length.wordsMax} слов (${length.labelRu}).")
            appendLine(StoryLengthPlan.structurePlan(length))
            appendLine(StoryRussianLanguage.PROMPT_BLOCK)
            if (selectedFact != null) {
                appendLine()
                appendLine("СЕМЯ ИСТОРИИ (проверенный факт из интернета — только это ядро):")
                appendLine(selectedFact.fact)
                appendLine()
                appendLine("РЕЦЕПТ ПОДАЧИ:")
                appendLine("1. КРЮЧОК — парадокс или безумный поворот из семени.")
                appendLine("2. КУХНЯ — человеческая драма из семени (если укладываешься по времени).")
                appendLine("3. СМЫСЛ — почему цепляет душу.")
                appendLine("НЕ перечисляй рекламу/фильмы/игры. НЕ Wikipedia. Факт + метафора + удар.")
            } else if (referenceFacts.isNotEmpty()) {
                appendLine()
                appendLine("СЕМЕНА ИСТОРИЙ (выбери ОДНО с максимальной драмой — не рекламу и не дискографию):")
                referenceFacts.take(4).forEachIndexed { i, fact ->
                    appendLine("${i + 1}. $fact")
                }
            } else {
                appendLine()
                appendLine("Факты из Wikipedia, Wikidata, DuckDuckGo, MusicBrainz — выбери самое живое:")
            }
            if (previousScripts.isNotEmpty()) {
                appendLine("УЖЕ БЫЛО — другой факт, другая подача:")
                previousScripts.take(3).forEachIndexed { i, s ->
                    appendLine("${i + 1}. ${s.take(180)}…")
                }
            }
            appendLine()
            appendLine("JSON.")
        }
    }
}
