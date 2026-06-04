package com.musicstory.app.data.remote

import com.google.gson.Gson
import com.musicstory.app.data.model.StoryQuotaInfo

/**
 * Railway returns 429 with `"source":"server"` before any Gemini/Groq call.
 * Do not confuse with LLM RPM/RPD limits ([Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits?hl=ru)).
 */
object ServerRateLimitParser {

    private val gson = Gson()

    data class Parsed(
        val message: String,
        val code: String?,
        val quota: StoryQuotaInfo?,
        val isServerSource: Boolean,
    )

    fun parse(body: String): Parsed? {
        if (body.isBlank()) return null
        return runCatching {
            val json = gson.fromJson(body, RateLimitErrorBody::class.java)
            val code = json.code?.trim().orEmpty().ifBlank { null }
            val quota = json.quota
            val server = json.source.equals("server", ignoreCase = true) ||
                code in SERVER_CODES
            val message = json.error?.trim().orEmpty().ifBlank {
                defaultMessage(code, quota)
            }
            Parsed(
                message = message,
                code = code,
                quota = quota,
                isServerSource = server,
            )
        }.getOrNull()
    }

    private fun defaultMessage(code: String?, quota: StoryQuotaInfo?): String = when (code) {
        "STORY_BURST" ->
            "Слишком частые запросы к серверу — подожди минуту. Это не лимит Gemini."
        "STORY_HOURLY" ->
            "На сервере не больше 10 историй в час. Подожди или добавь свой API-ключ."
        "TRIAL_MONTHLY_LIMIT" -> {
            val q = quota
            if (q?.monthlyLimit != null) {
                "Пробный период: использованы ${q.monthlyUsed ?: q.monthlyLimit}/${q.monthlyLimit} историй в месяце."
            } else {
                "Пробный период: месячный лимит историй исчерпан. Подписка 199 ₽/мес — до 25 в день."
            }
        }
        "DAILY_LIMIT" -> {
            val q = quota
            if (q != null) {
                "Лимит: сегодня ${q.used}/${q.limit} историй."
            } else {
                "Дневной лимит историй на сервере."
            }
        }
        "IP_HOURLY" -> "Слишком много запросов с этой сети к серверу."
        else -> "Лимит сервера Music Story (не Google Gemini)."
    }

    private val SERVER_CODES = setOf(
        "STORY_BURST",
        "STORY_HOURLY",
        "DAILY_LIMIT",
        "TRIAL_MONTHLY_LIMIT",
        "IP_HOURLY",
        "AUTH_RATE",
        "AUTH_DAILY",
        "HEALTH_RATE",
    )
}
