package com.musicstory.app.data.remote

import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface StoryApi {
    @GET("health")
    suspend fun health(): Map<String, Any?>

    @GET("v1/story/quota")
    suspend fun fetchQuota(): QuotaResponse

    @POST("v1/story/full")
    suspend fun fetchFullStory(@Body request: StoryRequest): StoryResponse
}
