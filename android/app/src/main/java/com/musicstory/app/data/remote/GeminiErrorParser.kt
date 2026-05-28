package com.musicstory.app.data.remote

import org.json.JSONObject

object GeminiErrorParser {

    fun parse(httpCode: Int, body: String, modelId: String? = null): String {
        val apiMessage = extractApiMessage(body)?.trim().orEmpty()
        val lower = (apiMessage.ifBlank { body }).lowercase()
        val modelLabel = modelLabel(modelId)

        if (httpCode == 400 && lower.contains("api_key_invalid")) {
            return "Неверный Gemini-ключ. Скопируйте ключ заново с aistudio.google.com/apikey"
        }

        if (httpCode == 401 || httpCode == 403) {
            return "Неверный Gemini-ключ. Скопируйте ключ заново с aistudio.google.com/apikey"
        }

        if (lower.contains("user location is not supported") ||
            lower.contains("location is not supported")
        ) {
            return "Gemini недоступен из вашего региона. Попробуйте Groq или генерацию через сервер Railway."
        }

        if (httpCode == 404 || lower.contains("not found")) {
            return "Модель $modelLabel недоступна. Выберите Gemini 2.0 Flash-Lite в настройках."
        }

        if (apiMessage.isNotBlank()) {
            if (isFreeTierUnavailable(lower)) {
                return if (isFlashLite(modelId)) {
                    "Не удалось подключиться к Gemini ($modelLabel): $apiMessage. " +
                        "Проверьте ключ на aistudio.google.com. Из РФ Gemini с телефона часто недоступен — попробуйте Groq."
                } else {
                    "Gemini: $apiMessage. Рекомендуем модель Gemini 2.0 Flash-Lite в настройках."
                }
            }
            if (httpCode == 429) {
                return "Gemini: $apiMessage"
            }
            return "Gemini: ${apiMessage.take(220)}"
        }

        if (httpCode == 429) {
            return "Слишком много запросов к Gemini. Подождите минуту и попробуйте снова."
        }

        return "Gemini: ошибка сервиса (HTTP $httpCode)"
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

    private fun isFlashLite(modelId: String?): Boolean {
        val id = modelId?.lowercase().orEmpty()
        return id.contains("flash-lite")
    }

    private fun modelLabel(modelId: String?): String {
        if (modelId.isNullOrBlank()) return "Gemini"
        return modelId.removePrefix("gemini-").replace("-", " ")
    }
}
