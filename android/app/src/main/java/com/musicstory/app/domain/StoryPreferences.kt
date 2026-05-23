package com.musicstory.app.domain

enum class StoryLength(
    val id: String,
    val labelRu: String,
    val wordsMin: Int,
    val wordsMax: Int,
    val sentenceHint: String,
    val maxTokens: Int,
) {
    SEC_15("15s", "15 секунд", 30, 42, "2–3 коротких предложения", 380),
    SEC_30("30s", "30 секунд", 65, 85, "4–6 коротких предложений", 650),
    SEC_60("60s", "1 минута", 125, 160, "6–10 предложений", 1200),
    UNLIMITED("unlimited", "Не ограничено", 180, 300, "8–14 предложений", 1500),
    ;

    companion object {
        fun fromId(id: String?): StoryLength =
            entries.firstOrNull { it.id == id } ?: SEC_30
    }
}

enum class TtsSpeed(val id: String, val labelRu: String, val yandexSpeed: Float, val androidRate: Float) {
    SLOW("slow", "Медленно", 0.82f, 0.84f),
    NORMAL("normal", "Нормально", 0.92f, 0.92f),
    FAST("fast", "Быстро", 1.06f, 1.05f),
    ;

    companion object {
        fun fromId(id: String?): TtsSpeed =
            entries.firstOrNull { it.id == id } ?: NORMAL
    }
}

enum class TtsEmotion(val id: String, val labelRu: String) {
    NEUTRAL("neutral", "Спокойная"),
    LIVELY("good", "Живая"),
    ;

    companion object {
        fun fromId(id: String?): TtsEmotion =
            entries.firstOrNull { it.id == id } ?: LIVELY
    }
}
