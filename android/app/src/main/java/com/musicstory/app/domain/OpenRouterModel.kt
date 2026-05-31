package com.musicstory.app.domain

enum class OpenRouterModel(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val stable: Boolean = false,
    val recommended: Boolean = false,
) {
    LIQUID_LFM(
        id = "liquid/lfm-2.5-1.2b-instruct:free",
        labelRu = "Liquid LFM 2.5 1.2B",
        descriptionRu = "Стабильная free — по умолчанию",
        stable = true,
        recommended = true,
    ),
    CUSTOM(
        id = "__custom__",
        labelRu = "Своя модель…",
        descriptionRu = "Free или платная — id с openrouter.ai/models",
    ),
    ;

    val settingsLabelRu: String
        get() = when {
            this == CUSTOM -> labelRu
            recommended && stable -> "$labelRu · бесплатная · оптимальная"
            stable -> "$labelRu · бесплатная · стабильная"
            else -> "$labelRu · бесплатная"
        }

    fun resolveApiModelId(customModelId: String): String? = when (this) {
        CUSTOM -> customModelId.trim().takeIf { it.contains('/') }
        else -> id
    }

    companion object {
        fun fromId(id: String?): OpenRouterModel =
            entries.firstOrNull { it.id == id?.trim() } ?: LIQUID_LFM

        val defaultRecommended: OpenRouterModel get() = LIQUID_LFM

        /** Presets verified stable — shown first in settings. */
        val stablePresets: List<OpenRouterModel> =
            entries.filter { it.stable && it != CUSTOM }
    }
}
