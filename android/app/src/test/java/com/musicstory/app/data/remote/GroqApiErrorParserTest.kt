package com.musicstory.app.data.remote

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GroqApiErrorParserTest {

    @Test
    fun rateLimitExceededIsNotDailyExhaustionMessage() {
        val body = """{"error":{"message":"Rate limit reached.","type":"tokens","code":"rate_limit_exceeded"}}"""
        val msg = GroqApiErrorParser.parse(429, body)
        assertFalse(msg.contains("исчерпан на сегодня"))
        assertTrue(msg.contains("Groq"))
    }

    @Test
    fun dailyLimitMentionedExplicitly() {
        val body = """{"error":{"message":"Rate limit reached for tokens per day (TPD)","code":"rate_limit_exceeded"}}"""
        val msg = GroqApiErrorParser.parse(429, body)
        assertTrue(msg.contains("дневной"))
    }
}
