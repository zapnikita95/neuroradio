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
    ROUTER_FREE(
        id = "openrouter/free",
        labelRu = "OpenRouter Free (авто)",
        descriptionRu = "Роутер OpenRouter — часто 429, нестабильно",
    ),
    DEEPSEEK_V4_FLASH(
        id = "deepseek/deepseek-v4-flash:free",
        labelRu = "DeepSeek V4 Flash",
        descriptionRu = "Часто rate-limit — нестабильно",
    ),
    QWEN3_NEXT_80B(
        id = "qwen/qwen3-next-80b-a3b-instruct:free",
        labelRu = "Qwen3 Next 80B",
        descriptionRu = "Сильнее, но free часто 429",
    ),
    GEMMA_4_26B(
        id = "google/gemma-4-26b-a4b-it:free",
        labelRu = "Gemma 4 26B",
        descriptionRu = "Баланс скорости и качества",
    ),
    NEMOTRON_NANO(
        id = "nvidia/nemotron-nano-9b-v2:free",
        labelRu = "Nemotron Nano 9B",
        descriptionRu = "Компактная free NVIDIA",
    ),
    GPT_OSS_120B(
        id = "openai/gpt-oss-120b:free",
        labelRu = "GPT-OSS 120B",
        descriptionRu = "Крупная free — может быть медленнее или 429",
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
