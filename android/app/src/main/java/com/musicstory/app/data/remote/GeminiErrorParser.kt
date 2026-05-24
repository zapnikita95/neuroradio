package com.musicstory.app.data.remote

import org.json.JSONObject

/**
 * Gemini API returns 429 for RPM bursts, geo blocks, and free-tier quota = 0 — not only daily exhaustion.
 * Show the API message; never invent "лимит исчерпан".
 */
object GeminiErrorParser {

    fun parse(httpCode: Int, body: String): String {
        val apiMessage = extractApiMessage(body)?.trim().orEmpty()
        val lower = (apiMessage.ifBlank { body }).lowercase()

        if (httpCode == 400 && lower.contains("api_key_invalid")) {
            return "Неверный Gemini-ключ. Скопируй заново с aistudio.google.com/apikey"
        }

        if (httpCode == 401 || httpCode == 403) {
            return "Неверный Gemini-ключ. Скопируй заново с aistudio.google.com/apikey"
        }

        if (lower.contains("user location is not supported") ||
            lower.contains("location is not supported")
        ) {
            return "Gemini с телефона недоступен из твоей страны. Попробуй Gemini 2.0 Flash-Lite или генерацию через сервер Railway."
        }

        if (isFreeTierUnavailable(lower)) {
            return "Gemini: бесплатная квота для этой модели = 0 (не «ты всё потратил»). Смени модель на 2.0 Flash-Lite."
        }

        if (httpCode == 429) {
            if (apiMessage.isNotBlank()) return "Gemini: ${apiMessage.take(200)}"
            return "Gemini: слишком много запросов — подожди 30–60 сек."
        }

        if (httpCode == 404 || lower.contains("not found")) {
            return "Модель Gemini недоступна. Выбери Gemini 2.0 Flash-Lite в настройках."
        }

        if (apiMessage.isNotBlank()) {
            return "Gemini: ${apiMessage.take(200)}"
        }

        return "Gemini HTTP $httpCode"
    }

    fun isFreeTierUnavailable(body: String): Boolean {
        val lower = body.lowercase()
        return lower.contains("limit: 0") ||
            lower.contains("\"quotavalue\":\"0\"") ||
            lower.contains("\"quotavalue\": \"0\"")
    }

    fun extractApiMessage(body: String): String? {
        if (body.isBlank()) return null
        return runCatching {
            JSONObject(body.trim()).optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
        }.getOrNull()
            ?: Regex(""""message"\s*:\s*"((?:\\.|[^"\\])*)"""")
                .find(body)?.groupValues?.get(1)
                ?.replace("\\\"", "\"")
                ?.takeIf { it.isNotBlank() }
    }
}
