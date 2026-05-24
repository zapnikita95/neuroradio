package com.musicstory.app.data.remote

import com.musicstory.app.domain.LlmProvider

object GroqErrorParser {

    fun parse(raw: String?, provider: LlmProvider = LlmProvider.GROQ): String {
        if (raw.isNullOrBlank()) {
            return if (provider == LlmProvider.GEMINI) {
                "Gemini не ответил — проверь интернет."
            } else {
                "Groq не ответил — проверь интернет."
            }
        }

        if (provider == LlmProvider.GEMINI) {
            val lower = raw.lowercase()
            if (
                raw.contains("Не получилось собрать историю") ||
                lower.contains("quality") ||
                lower.contains("проверку качества") ||
                lower.contains("попыток")
            ) {
                return GroqStoryClient.STORY_RETRY_MESSAGE
            }
            if (raw.startsWith("Gemini") && !raw.contains("Gemini HTTP")) {
                return raw.take(200)
            }
            return parseGemini(raw)
        }

        if (raw.startsWith("Groq") && !raw.contains("Groq HTTP") && !raw.trimStart().startsWith("{")) {
            return raw.take(200)
        }

        if (raw.contains("Не получилось собрать историю")) {
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }

        if (raw.contains("Groq HTTP")) {
            return parseGroqHttp(raw)
        }

        val lower = raw.lowercase()

        if (isAuthError(lower) || lower.contains("api_key_invalid")) {
            return "Неверный Groq API-ключ. Скопируй заново с console.groq.com/keys"
        }

        if (isJsonModeFailure(lower) || lower.contains("invalid json")) {
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }

        if (
            lower.contains("quality") ||
            lower.contains("проверку качества") ||
            lower.contains("попыток") ||
            lower.contains("wikipedia")
        ) {
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }

        if (looksLikeApiPayload(raw)) {
            val code = Regex("""HTTP (\d+)""").find(raw)?.groupValues?.get(1)?.toIntOrNull() ?: 0
            if (code > 0) return GroqApiErrorParser.parse(code, raw)
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }

        return raw
            .removePrefix("Groq HTTP ")
            .removePrefix("Groq ")
            .take(200)
    }

    private fun parseGroqHttp(raw: String): String {
        val code = Regex("""Groq HTTP (\d+)""").find(raw)?.groupValues?.get(1)?.toIntOrNull() ?: 0
        val body = raw.substringAfter(": ", raw).trim()
        return GroqApiErrorParser.parse(code, body)
    }

    private fun parseGemini(raw: String): String {
        val httpMatch = Regex("""Gemini HTTP (\d+)""").find(raw)
        val code = httpMatch?.groupValues?.get(1)?.toIntOrNull() ?: 0
        val bodyStart = raw.indexOf(':')
        val body = if (bodyStart >= 0) raw.substring(bodyStart + 1).trim() else raw
        return GeminiErrorParser.parse(if (code > 0) code else 500, body)
    }

    fun isAuthError(message: String): Boolean {
        val lower = message.lowercase()
        return lower.contains("invalid_api_key") ||
            lower.contains("invalid api key") ||
            (lower.contains("401") && lower.contains("invalid")) ||
            (lower.contains("401") && lower.contains("api_key"))
    }

    /** True only for HTTP 429 from Groq — not proof of daily quota exhaustion. */
    fun isRateLimitError(message: String): Boolean {
        val lower = message.lowercase()
        return Regex("""\b429\b""").containsMatchIn(lower) ||
            lower.contains("rate_limit_exceeded")
    }

    fun isJsonModeFailure(message: String): Boolean {
        val lower = message.lowercase()
        return lower.contains("json_validate_failed") ||
            lower.contains("failed to generate json")
    }

    fun isNonRetryable(message: String): Boolean {
        val lower = message.lowercase()
        return isAuthError(lower) ||
            (lower.contains("403") && lower.contains("forbidden")) ||
            GeminiErrorParser.isFreeTierUnavailable(lower) ||
            lower.contains("user location is not supported")
    }

    private fun looksLikeApiPayload(raw: String): Boolean {
        val trimmed = raw.trim()
        return trimmed.startsWith("{") ||
            trimmed.contains("\"error\"") ||
            trimmed.contains("\"failed_generation\"")
    }
}
