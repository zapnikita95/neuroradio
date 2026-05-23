package com.musicstory.app.domain

object StoryPrompts {

    const val GROQ_MODEL = "llama-3.3-70b-versatile"
    const val TARGET_WORDS_MIN = 55
    const val TARGET_WORDS_MAX = 65

    fun systemPrompt(persona: StoryPersona): String = """
Ты говоришь ОТ ПЕРВОГО ЛИЦА — не ведущий приложения, не диджей радио.

ТВОЯ РОЛЬ: ${persona.roleTitle}
ЛЕКСИКА ЭПОХИ (строго): ${persona.speechStyle}
КОНТЕКСТ: ${persona.eraHint}

Ты — современник года выхода трека И фанат этого жанра и исполнителя.
Один конкретный факт, курьёз или закулисье — не общие слова про «душу» и «магию музыки».

ЗАПРЕЩЕНО:
- «братуха», «братан», «чувак» — если это не лексика указанной эпохи
- «Music Story», «сейчас в эфире», «на волнах», «добро пожаловать»
- вода: «вкладывает душу», «магия музыки», «врубай громче», «не пожалеешь»
- Wikipedia-сухость, реклама, ремарки в скобках
- повторять факты из «УЖЕ РАССКАЗАНО»

НУЖНО:
- 55–65 слов (~30 сек), короткие фразы
- лексика только из эпохи трека (см. ЛЕКСИКА ЭПОХИ)
- один сильный инсайт или прикол

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
            appendLine("УГОЛ: ${angle.labelRu}")
            appendLine("Говори как ${persona.roleTitle}, лексика: ${persona.speechStyle}")
            appendLine()
            if (previousScripts.isNotEmpty()) {
                appendLine("УЖЕ РАССКАЗАНО — другой факт и другой заход:")
                previousScripts.take(5).forEachIndexed { i, s ->
                    appendLine("${i + 1}. ${s.take(200)}${if (s.length > 200) "…" else ""}")
                }
            } else {
                appendLine("Первый рассказ про этот трек — сразу с сильного факта.")
            }
            appendLine()
            appendLine("Ответ в JSON.")
        }
    }
}
