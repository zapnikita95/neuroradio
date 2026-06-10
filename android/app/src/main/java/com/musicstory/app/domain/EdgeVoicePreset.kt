package com.musicstory.app.domain

/** Microsoft Edge Neural voices (бесплатный тариф + опция на premium). */
enum class EdgeVoicePreset(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
) {
    DMITRY_CALM(
        id = "dmitry_calm",
        labelRu = "Дмитрий — спокойный",
        descriptionRu = "Ровный мужской голос Microsoft Edge",
    ),
    SVETLANA_CALM(
        id = "svetlana_calm",
        labelRu = "Светлана — спокойная",
        descriptionRu = "Нейтральный женский голос Microsoft Edge",
    ),
    DMITRY_LIVELY(
        id = "dmitry_lively",
        labelRu = "Дмитрий — бодрый",
        descriptionRu = "Энергичная мужская подача, ближе к радио",
    ),
    SVETLANA_LIVELY(
        id = "svetlana_lively",
        labelRu = "Светлана — живая",
        descriptionRu = "Выразительный женский голос",
    ),
    DARIA(
        id = "daria",
        labelRu = "Дария — мягкая",
        descriptionRu = "Мягкий женский тембр Microsoft Edge",
    ),
    ;

    companion object {
        private val LEGACY_VOICE_ALIASES = mapOf(
            "aidar" to DMITRY_CALM,
            "eugene" to DMITRY_LIVELY,
            "baya" to SVETLANA_CALM,
            "kseniya" to SVETLANA_LIVELY,
            "xenia" to SVETLANA_LIVELY,
            "calm_female" to SVETLANA_CALM,
            "calm_male" to DMITRY_CALM,
            "lively_female" to SVETLANA_LIVELY,
            "lively_male" to DMITRY_LIVELY,
            "bright_female" to SVETLANA_LIVELY,
        )

        fun fromId(id: String?): EdgeVoicePreset {
            val raw = id?.trim().orEmpty()
            entries.firstOrNull { it.id == raw }?.let { return it }
            LEGACY_VOICE_ALIASES[raw]?.let { return it }
            return SVETLANA_CALM
        }
    }
}
