package com.musicstory.app.data.model

import com.google.gson.annotations.SerializedName

data class LlmProbeRequest(
    @SerializedName("llm_provider") val llmProvider: String,
    val model: String? = null,
    @SerializedName("groq_api_key") val groqApiKey: String? = null,
    @SerializedName("gemini_api_key") val geminiApiKey: String? = null,
    @SerializedName("openrouter_api_key") val openRouterApiKey: String? = null,
)

data class LlmProbeResponse(
    val ok: Boolean = false,
    val message: String = "",
)
