package com.musicstory.app.domain

enum class GroqModel(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val recommended: Boolean = false,
) {
    LLAMA_33_70B(
        id = "llama-3.3-70b-versatile",
        labelRu = "Llama 3.3 70B",
        descriptionRu = "Основная модель Groq",
        recommended = true,
    ),
    LLAMA_31_8B(
        id = "llama-3.1-8b-instant",
        labelRu = "Llama 3.1 8B",
        descriptionRu = "Быстрее, слабее",
    ),
    GPT_OSS_20B(
        id = "openai/gpt-oss-20b",
        labelRu = "GPT-OSS 20B",
        descriptionRu = "Отдельный RPM-бакет",
    ),
    CUSTOM(
        id = "__custom__",
        labelRu = "Своя модель…",
        descriptionRu = "Введи id с console.groq.com/docs/models",
    ),
    ;

    val settingsLabelRu: String
        get() = when {
            this == CUSTOM -> labelRu
            recommended -> "$labelRu · оптимальная"
            else -> labelRu
        }

    fun resolveApiModelId(customModelId: String): String? = when (this) {
        CUSTOM -> customModelId.trim().takeIf { it.isNotEmpty() }
        else -> id
    }

    companion object {
        fun fromId(id: String?): GroqModel =
            entries.firstOrNull { it.id == id?.trim() } ?: LLAMA_33_70B

        val defaultRecommended: GroqModel get() = LLAMA_33_70B
    }
}
