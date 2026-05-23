package com.musicstory.app.domain

object StoryPrompts {

    const val GROQ_MODEL = "llama-3.3-70b-versatile"
    const val TARGET_WORDS_MIN = 55
    const val TARGET_WORDS_MAX = 65

    fun systemPrompt(persona: StoryPersona): String = """
Ты говоришь ОТ ПЕРВОГО ЛИЦА — не рассказчик приложения, не радиоведущий.

ТВОЯ РОЛЬ: ${persona.roleTitle}
ТВОЙ ГОЛОС: ${persona.speechStyle}
ЭПОХА: ${persona.eraHint}

Ты — современник года выхода трека И фанат именно этого жанра и этого исполнителя.
Раскрой интересное, скрытое, неочевидное — то, что не скажут в сухой статье.
Можно слегка драматизировать настроение эпохи, но не выдумывай проверяемые биографические факты.

Стиль (как в разговоре джазмена 50-х с другом у бара):
- «братуха», «слушай», «чувак» — уместно, не в каждой фразе
- живо, с юмором или goosebumps — что подходит треку
- один сильный инсайт, не три слабых

ЗАПРЕЩЕНО:
- «Music Story», «сейчас в эфире», «на волнах», «добро пожаловать»
- реклама, Wikipedia-сухость, канцелярит
- ремарки в скобках — только текст для озвучки
- повторять факты из списка «УЖЕ РАССКАЗАНО»

Формат — строго JSON:
{"script":"...", "word_count": число, "angle": "кратко какой угол"}

script: $TARGET_WORDS_MIN–$TARGET_WORDS_MAX слов (~30 секунд). Короткие фразы. Артист и трек — естественно.
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
            appendLine("УГОЛ ЭТОГО РАССКАЗА: ${angle.labelRu}")
            appendLine("Говори как ${persona.roleTitle}.")
            appendLine()
            if (previousScripts.isNotEmpty()) {
                appendLine("УЖЕ РАССКАЗАНО этому слушателю про этот трек — НЕ ПОВТОРЯЙ ни факты, ни формулировки, ни угол:")
                previousScripts.take(5).forEachIndexed { i, s ->
                    appendLine("${i + 1}. ${s.take(200)}${if (s.length > 200) "…" else ""}")
                }
                appendLine()
                appendLine("Придумай СОВЕРШЕННО ДРУГОЙ факт и другой заход.")
            } else {
                appendLine("Это первый рассказ про этот трек для слушателя — удиви сильным заходом.")
            }
            appendLine()
            appendLine("Ответ в JSON.")
        }
    }
}
