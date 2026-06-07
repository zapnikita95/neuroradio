package com.musicstory.app.data.remote

import org.json.JSONObject

object GroqApiErrorParser {

    fun parse(httpCode: Int, body: String): String {
        val apiMessage = extractApiMessage(body)
        val errorCode = extractErrorCode(body)
        val text = apiMessage ?: body.replace(Regex("\\s+"), " ").trim()
        val lower = text.lowercase()

        if (httpCode == 401 || isAuthError(body, lower)) {
            return "Неверный Groq API-ключ. Скопируйте ключ заново с console.groq.com/keys"
        }

        if (httpCode == 403 || lower.contains("forbidden")) {
            return "Groq отклонил запрос. Из РФ Groq с телефона часто недоступен — попробуйте Gemini или сервер приложения."
        }

        if (httpCode == 429 || errorCode == "rate_limit_exceeded" || lower.contains("rate limit")) {
            return formatRateLimit(text, lower)
        }

        if (httpCode == 400 && (errorCode == "model_decommissioned" || lower.contains("decommissioned"))) {
            return "Выбранная модель Groq больше не поддерживается. Обновите приложение или выберите другую модель."
        }

        if (httpCode == 400 && lower.contains("json_validate_failed")) {
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }

        if (text.isNotBlank()) {
            return "Groq: ${text.take(220)}"
        }

        return "Groq: ошибка сервиса (HTTP $httpCode)"
    }

    private fun formatRateLimit(text: String, lower: String): String {
        if (text.isNotBlank()) {
            return if (
                lower.contains("free-models-per-day") ||
                lower.contains("per day") ||
                lower.contains("tokens per day")
            ) {
                "Groq (дневной лимит): ${text.take(220)}"
            } else {
                "Groq: ${text.take(220)}"
            }
        }
        return "Groq: превышен лимит запросов (429)"
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
