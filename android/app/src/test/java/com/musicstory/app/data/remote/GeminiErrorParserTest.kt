package com.musicstory.app.data.remote

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeminiErrorParserTest {

    @Test
    fun limitZeroIsNotDailyExhaustion() {
        val body = """{"error":{"code":429,"message":"limit: 0","status":"RESOURCE_EXHAUSTED"}}"""
        assertTrue(GeminiErrorParser.isFreeTierUnavailable(body))
        assertTrue(
            GeminiErrorParser.parse(429, body).contains("= 0"),
        )
        assertFalse(GeminiErrorParser.parse(429, body).contains("исчерпан на сегодня"))
    }

    @Test
    fun geoBlockIsExplained() {
        val body = """{"error":{"message":"User location is not supported"}}"""
        assertTrue(
            GeminiErrorParser.parse(400, body).contains("стран"),
        )
    }

    @Test
    fun rateLimitShowsApiText() {
        val body = """{"error":{"message":"Rate limit reached for requests per minute"}}"""
        val msg = GeminiErrorParser.parse(429, body)
        assertTrue(msg.contains("Rate limit"))
        assertFalse(msg.contains("исчерпан на сегодня"))
    }
}
