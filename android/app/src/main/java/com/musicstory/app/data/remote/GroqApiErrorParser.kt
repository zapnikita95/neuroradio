package com.musicstory.app.data.remote

import org.json.JSONObject

/**
 * Groq returns code `rate_limit_exceeded` for RPM/TPM bursts too — not only daily quota.
 * Never invent "лимит исчерпан на сегодня" unless the API message says so explicitly.
 */
object GroqApiErrorParser {

    fun parse(httpCode: Int, body: String): String {
        val apiMessage = extractApiMessage(body)
        val errorCode = extractErrorCode(body)
        val text = apiMessage ?: body.replace(Regex("\\s+"), " ").trim()
        val lower = text.lowercase()

        if (httpCode == 401 || isAuthError(body, lower)) {
            return "Неверный Groq API-ключ. Скопируй заново с console.groq.com/keys"
        }

        if (httpCode == 403 || lower.contains("forbidden")) {
            return "Groq отклонил запрос (403). Из РФ с телефона Groq часто недоступен — выбери Gemini или сервер Railway."
        }

        if (httpCode == 429 || errorCode == "rate_limit_exceeded" || lower.contains("rate limit")) {
            return formatRateLimit(text, lower)
        }

        if (httpCode == 400 && (errorCode == "model_decommissioned" || lower.contains("decommissioned"))) {
            return "Groq: модель на сервере устарела — обнови приложение или подожди деплой Railway."
        }

        if (httpCode == 400 && lower.contains("json_validate_failed")) {
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }

        if (text.isNotBlank()) {
            return "Groq: ${text.take(200)}"
        }

        return "Groq HTTP $httpCode"
    }

    private fun formatRateLimit(text: String, lower: String): String {
        if (lower.contains("per day") || lower.contains("tokens per day") || lower.contains(" tpd")) {
            return "Groq (дневной лимит): ${text.take(200)}"
        }
        if (lower.contains("per minute") || lower.contains(" tpm") || lower.contains(" rpm")) {
            return "Groq: слишком много запросов в минуту — подожди 30–60 сек и попробуй снова."
        }
        // Unknown rate limit — show API text, do NOT claim daily exhaustion
        return "Groq: ${text.take(200)}"
    }

    fun extractApiMessage(body: String): String? {
        if (body.isBlank()) return null
        return runCatching {
            JSONObject(body.trim()).optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
        }.getOrNull()
            ?: Regex(""""message"\s*:\s*"((?:\\.|[^"\\])*)"""")
                .find(body)?.groupValues?.get(1)
                ?.replace("\\\"", "\"")
                ?.replace("\\n", " ")
                ?.takeIf { it.isNotBlank() }
    }

    private fun extractErrorCode(body: String): String? {
        return runCatching {
            JSONObject(body.trim()).optJSONObject("error")?.optString("code")?.takeIf { it.isNotBlank() }
        }.getOrNull()
            ?: Regex(""""code"\s*:\s*"([^"]+)"""").find(body)?.groupValues?.get(1)
    }

    private fun isAuthError(body: String, lower: String): Boolean {
        return lower.contains("invalid_api_key") ||
            lower.contains("invalid api key") ||
            (body.contains("401") && lower.contains("invalid"))
    }
}
