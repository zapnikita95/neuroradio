package com.musicstory.app.data.remote

import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.LlmProbeRequest
import com.musicstory.app.data.model.LlmProbeResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface StoryApi {
    @GET("health")
    suspend fun health(): Map<String, Any?>

    @GET("health/ollama")
    suspend fun healthOllama(
        @Query("url") ollamaUrl: String?,
        @Query("model") model: String?,
    ): Map<String, Any?>

    @GET("v1/story/quota")
    suspend fun fetchQuota(): QuotaResponse

    @POST("v1/story/full")
    suspend fun fetchFullStory(@Body request: StoryRequest): StoryResponse

    @POST("v1/llm/probe")
    suspend fun probeLlm(@Body request: LlmProbeRequest): LlmProbeResponse

    @POST("v1/billing/dev-tier")
    suspend fun setDevTier(@Body request: DevTierRequest): DevTierResponse

    @GET("v1/billing/status")
    suspend fun billingStatus(): BillingStatusResponse

    @POST("v1/story/feedback")
    suspend fun submitStoryFeedback(@Body request: StoryFeedbackRequest): Map<String, Any?>
}

data class StoryFeedbackRequest(
    val artist: String,
    val title: String,
    val vote: String,
    val reason: String? = null,
    val reasons: List<String>? = null,
    val script: String? = null,
    val historyId: String? = null,
)
