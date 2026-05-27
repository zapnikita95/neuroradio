package com.musicstory.app.domain

enum class LlmProvider(
    val id: String,
    val labelRu: String,
) {
    OPENROUTER("openrouter", "OpenRouter"),
    GROQ("groq", "Groq"),
    GEMINI("gemini", "Gemini"),
    ;

    companion object {
        fun fromId(id: String?): LlmProvider =
            entries.firstOrNull { it.id == id?.trim()?.lowercase() } ?: OPENROUTER
    }
}
