package com.musicstory.app.domain

enum class OpenRouterModel(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val recommended: Boolean = false,
) {
    ROUTER_FREE(
        id = "openrouter/free",
        labelRu = "OpenRouter Free (авто)",
        descriptionRu = "Роутер выберет бесплатную модель",
        recommended = true,
    ),
    DEEPSEEK_V4_FLASH(
        id = "deepseek/deepseek-v4-flash:free",
        labelRu = "DeepSeek V4 Flash",
        descriptionRu = "Быстрая free — стилизация истории",
    ),
    LIQUID_LFM(
        id = "liquid/lfm-2.5-1.2b-instruct:free",
        labelRu = "Liquid LFM 2.5 1.2B",
        descriptionRu = "Очень быстрая free",
    ),
    QWEN3_NEXT_80B(
        id = "qwen/qwen3-next-80b-a3b-instruct:free",
        labelRu = "Qwen3 Next 80B",
        descriptionRu = "Сильнее для фактов",
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
        descriptionRu = "Крупная free (медленнее)",
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
            recommended -> "$labelRu · бесплатная · оптимальная"
            else -> "$labelRu · бесплатная"
        }

    fun resolveApiModelId(customModelId: String): String? = when (this) {
        CUSTOM -> customModelId.trim().takeIf { it.contains('/') }
        else -> id
    }

    companion object {
        fun fromId(id: String?): OpenRouterModel =
            entries.firstOrNull { it.id == id?.trim() } ?: ROUTER_FREE

        val defaultRecommended: OpenRouterModel get() = ROUTER_FREE
    }
}
