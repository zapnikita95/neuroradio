package com.musicstory.app.domain

enum class OpenRouterModel(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val stable: Boolean = false,
    val recommended: Boolean = false,
) {
    DEEPSEEK_V3(
        id = "deepseek/deepseek-chat-v3-0324",
        labelRu = "DeepSeek V3",
        descriptionRu = "Дешёвая (~$0.20/M) — лучшая для поиска фактов",
        stable = true,
        recommended = true,
    ),
    GEMMA_4_26B_FREE(
        id = "google/gemma-4-26b-a4b-it:free",
        labelRu = "Gemma 4 (бесплатно)",
        descriptionRu = "Быстрее, факты точнее — до 5 историй в день",
        stable = true,
    ),
        NEMOTRON_NANO(
        id = "nvidia/nemotron-3-nano-30b-a3b:free",
        labelRu = "Nemotron (бесплатно)",
        descriptionRu = "Может думать дольше, до 10 историй в день — лимиты не суммируются",
        stable = true,
    ),
    GEMMA_4_26B(
        id = "google/gemma-4-26b-a4b-it",
        labelRu = "Gemma 4 26B",
        descriptionRu = "Дешёвая (~$0.06/M) — JSON и факты",
        stable = true,
    ),
    LIQUID_LFM(
        id = "liquid/lfm-2.5-1.2b-instruct:free",
        labelRu = "Liquid LFM 2.5 1.2B",
        descriptionRu = "Free — быстрый текст, факты слабее",
        stable = true,
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
            recommended && stable -> "$labelRu · оптимальная для фактов"
            stable -> "$labelRu · проверенная"
            else -> labelRu
        }

    fun resolveApiModelId(customModelId: String): String? = when (this) {
        CUSTOM -> customModelId.trim().takeIf { it.contains('/') }
        else -> id
    }

    companion object {
        fun fromId(id: String?): OpenRouterModel =
            entries.firstOrNull { it.id == id?.trim() } ?: DEEPSEEK_V3

        val defaultRecommended: OpenRouterModel get() = DEEPSEEK_V3

        val freeServerPresets: List<OpenRouterModel> =
            listOf(NEMOTRON_NANO, GEMMA_4_26B_FREE)

        val defaultFreeServer: OpenRouterModel get() = NEMOTRON_NANO

        /** Presets verified stable — shown first in settings. */
        val stablePresets: List<OpenRouterModel> =
            entries.filter { it.stable && it != CUSTOM }
    }
}
