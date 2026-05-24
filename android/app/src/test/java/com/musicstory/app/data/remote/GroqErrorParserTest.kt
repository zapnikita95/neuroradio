package com.musicstory.app.data.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class GroqErrorParserTest {

    @Test
    fun hidesRawJsonValidateError() {
        val raw =
            """400: {"error":{"message":"Failed to generate JSON. Please adjust your prompt.","type":"invalid_request_error","code":"json_validate_failed"}}"""
        assertEquals(GroqStoryClient.STORY_RETRY_MESSAGE, GroqErrorParser.parse(raw))
    }

    @Test
    fun detectsJsonModeFailure() {
        assertFalse(GroqErrorParser.isJsonModeFailure("Groq HTTP 500"))
        assertEquals(true, GroqErrorParser.isJsonModeFailure("json_validate_failed"))
    }
}
