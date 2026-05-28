package com.musicstory.app.data.remote

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeminiErrorParserTest {

    @Test
    fun limitZeroOnFlashLiteExplainsRegion() {
        val body = """{"error":{"code":429,"message":"limit: 0","status":"RESOURCE_EXHAUSTED"}}"""
        assertTrue(GeminiErrorParser.isFreeTierUnavailable(body))
        val msg = GeminiErrorParser.parse(429, body, "gemini-2.0-flash-lite")
        assertTrue(msg.contains("limit: 0"))
        assertTrue(msg.contains("Groq") || msg.contains("aistudio"))
        assertFalse(msg.contains("Смени модель на 2.0 Flash-Lite"))
    }

    @Test
    fun limitZeroOnOtherModelSuggestsFlashLite() {
        val body = """{"error":{"message":"limit: 0"}}"""
        val msg = GeminiErrorParser.parse(429, body, "gemini-2.5-flash")
        assertTrue(msg.contains("Flash-Lite"))
    }

    @Test
    fun geoBlockIsExplained() {
        val body = """{"error":{"message":"User location is not supported"}}"""
        assertTrue(
            GeminiErrorParser.parse(400, body).contains("регион"),
        )
    }

    @Test
    fun rateLimitShowsApiText() {
        val body = """{"error":{"message":"Rate limit reached for requests per minute"}}"""
        val msg = GeminiErrorParser.parse(429, body)
        assertTrue(msg.contains("Rate limit"))
    }
}
