package com.musicstory.app.domain

enum class StoryLength(
    val id: String,
    val labelRu: String,
    val wordsMin: Int,
    val wordsMax: Int,
    val sentenceHint: String,
    val maxTokens: Int,
) {
    SEC_30(
        id = "30s",
        labelRu = "30 секунд · быстрый темп",
        wordsMin = 72,
        wordsMax = 100,
        sentenceHint = "4–7 коротких предложений — под быструю озвучку",
        maxTokens = 720,
    ),
    SEC_60(
        id = "60s",
        labelRu = "1 минута · основной",
        wordsMin = 130,
        wordsMax = 175,
        sentenceHint = "7–11 предложений — основной режим",
        maxTokens = 1300,
    ),
    UNLIMITED(
        id = "unlimited",
        labelRu = "Не ограничено",
        wordsMin = 195,
        wordsMax = 320,
        sentenceHint = "9–15 предложений",
        maxTokens = 1600,
    ),
    ;

    companion object {
        fun fromId(id: String?): StoryLength = when (id) {
            "15s" -> SEC_30
            null -> SEC_60
            else -> entries.firstOrNull { it.id == id } ?: SEC_60
        }
    }
}

/** Slightly above Yandex “normal” (1.0) — app default pacing feels brisk, not sluggish. */
enum class TtsSpeed(val id: String, val labelRu: String, val yandexSpeed: Float, val androidRate: Float) {
    VERY_SLOW("very_slow", "Очень медленно", 0.82f, 0.84f),
    SLOW("slow", "Медленно", 0.90f, 0.90f),
    NORMAL("normal", "Нормально", 1.0f, 1.0f),
    FAST("fast", "Быстро", 1.08f, 1.06f),
    VERY_FAST("very_fast", "Очень быстро", 1.14f, 1.10f),
    ;

    companion object {
        fun fromId(id: String?): TtsSpeed =
            entries.firstOrNull { it.id == id } ?: NORMAL
    }
}

enum class TtsEmotion(val id: String, val labelRu: String, val descriptionRu: String) {
    NEUTRAL("neutral", "Нейтральная", "Ровная, спокойная подача"),
    LIVELY("good", "Живая", "Дружелюбная, тёплая интонация"),
    STRICT("evil", "Строгая", "Жёсткая, драматичная — лучше со строгими голосами"),
    ;

    companion object {
        fun fromId(id: String?): TtsEmotion =
            entries.firstOrNull { it.id == id } ?: LIVELY
    }
}
