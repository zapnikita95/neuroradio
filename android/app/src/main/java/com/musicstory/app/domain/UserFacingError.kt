package com.musicstory.app.domain

import android.content.Context
import com.musicstory.app.R
import java.io.IOException
import java.net.SocketTimeoutException
import kotlin.coroutines.cancellation.CancellationException
import retrofit2.HttpException

/** Maps OkHttp/Retrofit/system exceptions to copy that does not blame «the server disconnected». */
object UserFacingError {

    /** Cancel / track skip / connection drop mid-request — no error banner. */
    fun isBenignStoryCancel(throwable: Throwable?): Boolean {
        if (throwable == null) return false
        if (throwable is CancellationException) return true
        return isBenignStoryCancelMessage(throwable.message)
    }

    fun isBenignStoryCancelMessage(raw: String?): Boolean {
        val msg = raw?.trim().orEmpty()
        if (msg.isBlank()) return false
        if (msg.contains("cancel", ignoreCase = true)) return true
        if (msg.contains("отмен", ignoreCase = true)) return true
        if (msg.contains("499")) return true
        return isConnectionInterrupt(msg)
    }

    fun message(context: Context, throwable: Throwable?): String {
        if (throwable == null) return context.getString(R.string.error_story_generic)
        if (isBenignStoryCancel(throwable)) return ""
        return when (throwable) {
            is SocketTimeoutException -> context.getString(R.string.error_story_slow)
            is HttpException -> messageForHttp(context, throwable.code(), throwable.message())
            is IOException -> message(context, throwable.message)
            else -> message(context, throwable.message)
        }
    }

    fun message(context: Context, raw: String?): String {
        val msg = raw?.trim().orEmpty()
        if (msg.isBlank()) return context.getString(R.string.error_story_generic)
        if (isBenignStoryCancelMessage(msg)) return ""

        val lower = msg.lowercase()
        when {
            isOurCuratedMessage(lower) -> return msg
            lower.contains("timeout") ||
                lower.contains("timed out") ||
                lower.contains("долго отвеч") ||
                lower.contains("превышен лимит времени") ->
                return context.getString(R.string.error_story_slow)
            lower.contains("нет интернет") ||
                lower.contains("network is unreachable") ||
                lower.contains("unable to resolve") ||
                lower.contains("failed to connect") ||
                lower.contains("econnrefused") ||
                lower.contains("no address associated") ->
                return context.getString(R.string.error_story_network)
            isConnectionInterrupt(msg) ->
                return context.getString(R.string.error_story_interrupted)
            lower.contains("лимит") && !looksTechnical(lower) -> return msg
            lower.contains("не получилось собрать историю") ||
                lower.contains("не прошёл проверку") ||
                lower.contains("проверенных данных") ||
                lower.contains("факт") && lower.contains("нет") ->
                return msg
            looksTechnical(lower) -> return context.getString(R.string.error_story_generic)
            msg.length <= 160 && !lower.startsWith("http ") -> return msg
            else -> return context.getString(R.string.error_story_generic)
        }
    }

    private fun messageForHttp(context: Context, code: Int, fallback: String?): String {
        return when (code) {
            429 -> context.getString(R.string.error_story_rate_limit)
            499 -> ""
            503 -> fallback?.takeIf { isOurCuratedMessage(it.lowercase()) }
                ?: context.getString(R.string.error_story_unavailable)
            504 -> context.getString(R.string.error_story_slow)
            in 500..599 -> context.getString(R.string.error_story_unavailable)
            else -> message(context, fallback)
        }
    }

    private fun isOurCuratedMessage(lower: String): Boolean =
        lower.contains("не получилось") ||
            lower.contains("нажми") ||
            lower.contains("рассказать историю") ||
            lower.contains("проверен") ||
            lower.contains("лимит сервера") ||
            lower.contains("проверь ключ")

    private fun isConnectionInterrupt(msg: String): Boolean {
        val lower = msg.lowercase()
        return lower.contains("прерван") ||
            lower.contains("разорван") ||
            lower.contains("connection abort") ||
            lower.contains("stream was reset") ||
            lower.contains("unexpected end of stream") ||
            lower.contains("socket closed") ||
            lower.contains("software caused connection abort") ||
            lower.contains("connection reset") ||
            lower.contains("broken pipe") ||
            (lower.contains("соединен") && (lower.contains("сброш") || lower.contains("закры") || lower.contains("прерван")))
    }

    private fun looksTechnical(lower: String): Boolean =
        lower.contains("http ") ||
            lower.contains("okhttp") ||
            lower.contains("retrofit") ||
            lower.contains("java.") ||
            lower.contains("kotlin.") ||
            lower.contains("exception") ||
            lower.contains("socketexception") ||
            lower.contains("ssl") ||
            lower.contains("certificate") ||
            lower.contains("nsurlerror") ||
            lower.contains("error -") ||
            lower.contains("ошибка -") ||
            lower.contains("не удалось завершить операцию") ||
            lower.contains("operation couldn't") ||
            lower.contains("canceled") && lower.contains("call")
}
