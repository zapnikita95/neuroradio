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

/** Slightly above Yandex “normal” (1.0) — labels must match perceived speed. */
enum class TtsSpeed(val id: String, val labelRu: String, val yandexSpeed: Float, val androidRate: Float) {
    VERY_SLOW("very_slow", "Очень медленно", 0.88f, 0.84f),
    SLOW("slow", "Медленно", 1.0f, 0.92f),
    NORMAL("normal", "Нормально", 1.15f, 1.08f),
    FAST("fast", "Быстро", 1.32f, 1.22f),
    VERY_FAST("very_fast", "Очень быстро", 1.48f, 1.35f),
    ;

    companion object {
        fun fromId(id: String?): TtsSpeed =
            entries.firstOrNull { it.id == id } ?: NORMAL
    }
}

/** Тестовый переключатель: Yandex на Railway (prod) vs системный TTS на телефоне. */
enum class TtsPlaybackEngine(val id: String, val labelRu: String, val descriptionRu: String) {
    YANDEX_SERVER(
        id = "yandex",
        labelRu = "Yandex SpeechKit (сервер)",
        descriptionRu = "Озвучка на сервере приложения — основной режим",
    ),
    ANDROID_DEVICE(
        id = "android",
        labelRu = "Android TTS (тест)",
        descriptionRu = "Системный голос телефона — экспериментальный режим",
    ),
    ;

    val skipsServerTts: Boolean get() = this == ANDROID_DEVICE

    companion object {
        fun fromId(id: String?): TtsPlaybackEngine =
            entries.firstOrNull { it.id == id } ?: YANDEX_SERVER
    }
}

/** Кто платит за озвучку на сервере: наш SpeechKit или ключ пользователя. */
enum class UserTtsBilling(val id: String, val labelRu: String, val descriptionRu: String) {
    SERVER(
        id = "server",
        labelRu = "Сервер приложения",
        descriptionRu = "Yandex SpeechKit на сервере приложения",
    ),
    YANDEX(
        id = "yandex",
        labelRu = "Свой Yandex SpeechKit",
        descriptionRu = "API Key + Folder ID из Yandex Cloud — списание с вашего счёта",
    ),
    SBER(
        id = "sber",
        labelRu = "Свой SaluteSpeech (Сбер)",
        descriptionRu = "Authorization Key из developers.sber.ru — работает из РФ, freemium до лимита",
    ),
    ;

    companion object {
        fun fromId(id: String?): UserTtsBilling =
            entries.firstOrNull { it.id == id } ?: SERVER
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
