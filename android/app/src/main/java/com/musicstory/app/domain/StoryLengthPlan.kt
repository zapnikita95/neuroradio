package com.musicstory.app.domain

object StoryLengthPlan {
    fun structurePlan(length: StoryLength): String = when (length) {
        StoryLength.SEC_30 -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (30 сек — короткая, под БЫСТРЫЙ темп озвучки):
            - КРЮЧОК → одна сцена драмы из факта → финал одной фразой.
            - ${length.wordsMin}–${length.wordsMax} слов максимум, ${length.sentenceHint}.
            - Рассчитано на «Быстро» / «Очень быстро» в настройках — не раздувай.
        """.trimIndent()

        StoryLength.SEC_60 -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (60 сек — ОСНОВНОЙ режим, слегка ускоренная речь):
            - Крючок → внутренняя кухня (драма из факта) → глубокий смысл.
            - ${length.wordsMin}–${length.wordsMax} слов, ${length.sentenceHint}.
            - Один сильный факт целиком, без воды.
        """.trimIndent()

        StoryLength.UNLIMITED -> """
            ПЛАН ДЛИТЕЛЬНОСТИ (развёрнуто):
            - Полная байка: крючок → кухня → смысл → финальный удар.
            - ${length.wordsMin}–${length.wordsMax} слов, ${length.sentenceHint}.
        """.trimIndent()
    }
}
