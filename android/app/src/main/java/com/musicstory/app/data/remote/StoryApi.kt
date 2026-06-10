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
    suspend fun billingStatus(@Query("appLanguage") appLanguage: String? = null): BillingStatusResponse

    @GET("v1/billing/language-switch")
    suspend fun languageSwitch(@Query("target") target: String): LanguageSwitchResponse

    @POST("v1/billing/verify/google-play")
    suspend fun verifyGooglePlay(@Body request: GooglePlayVerifyRequest): IapVerifyResponse

    @POST("v1/billing/unlink-card")
    suspend fun unlinkCard(): UnlinkCardResponse

    @POST("v1/public/payment/create")
    suspend fun createPayment(@Body request: PaymentCreateRequest): PaymentCreateResponse

    @POST("v1/story/feedback")
    suspend fun submitStoryFeedback(@Body request: StoryFeedbackRequest): Map<String, Any?>

    @GET("v1/facts/hint")
    suspend fun fetchFactHint(
        @Query("artist") artist: String,
        @Query("title") title: String,
    ): FactHintResponse
}

data class FactHintResponse(
    val hasHotFact: Boolean = false,
    val hotCount: Int = 0,
)

data class StoryFeedbackRequest(
    val artist: String,
    val title: String,
    val vote: String,
    val reason: String? = null,
    val reasons: List<String>? = null,
    val script: String? = null,
    val historyId: String? = null,
)

data class PaymentCreateRequest(
    val email: String,
    val plan: String,
)

data class PaymentCreateResponse(
    val ok: Boolean? = null,
    val confirmationUrl: String? = null,
    val error: String? = null,
    val hint: String? = null,
)

data class GooglePlayVerifyRequest(
    val productId: String,
    val purchaseToken: String,
)

data class IapVerifyResponse(
    val ok: Boolean? = null,
    val tier: String? = null,
    val subscriptionMarket: String? = null,
    val hint: String? = null,
    val error: String? = null,
    val code: String? = null,
    val entitlement: BillingEntitlementResponse? = null,
)

data class LanguageSwitchPolicyResponse(
    val allowed: Boolean = true,
    val reason: String? = null,
    val hintRu: String? = null,
    val hintEn: String? = null,
    val note: String? = null,
)

data class LanguageSwitchResponse(
    val target: String? = null,
    val subscriptionMarket: String? = null,
    val policy: LanguageSwitchPolicyResponse? = null,
)
