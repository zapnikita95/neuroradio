package com.musicstory.app.domain

object StoryLengthPlan {
    fun structurePlan(length: StoryLength): String = when (length) {
        StoryLength.SEC_15 -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (15 сек — ЖЁСТКИЙ ЛИМИТ):
            - Только КРЮЧОК + одна ударная финальная строка.
            - ${length.wordsMin}–${length.wordsMax} слов максимум, ${length.sentenceHint}.
            - Без «кухни» и развёрнутого смысла — один удар и точка.
        """.trimIndent()

        StoryLength.SEC_30 -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (30 сек — ЖЁСТКИЙ ЛИМИТ):
            - КРЮЧОК → одна сцена драмы из факта → финал-смысл одной фразой.
            - ${length.wordsMin}–${length.wordsMax} слов максимум, ${length.sentenceHint}.
            - Если длиннее — обрежут при озвучке. Не раздувай.
        """.trimIndent()

        StoryLength.SEC_60 -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (60 сек):
            - Крючок → внутренняя кухня (человеческая драма из факта) → глубокий смысл.
            - ${length.wordsMin}–${length.wordsMax} слов, ${length.sentenceHint}.
        """.trimIndent()

        StoryLength.UNLIMITED -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (развёрнуто):
            - Полная байка: крючок → кухня → смысл → финальный удар.
            - ${length.wordsMin}–${length.wordsMax} слов, ${length.sentenceHint}.
        """.trimIndent()
    }
}
