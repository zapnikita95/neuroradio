package com.musicstory.app.util

import java.net.URI

object BackendUrlRules {

    private val CLOUD_HOST_MARKERS = listOf(
        "railway.app",
        "music-story-production",
        "vercel.app",
        "herokuapp.com",
    )

    /** Local BFF on PC — phone must use http://ZT_IP:3000, not Railway. */
    fun isLanBackend(url: String): Boolean {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return false
        return runCatching {
            val uri = URI(trimmed)
            val scheme = uri.scheme?.lowercase().orEmpty()
            if (scheme != "http") return false
            val host = uri.host?.lowercase().orEmpty()
            if (host.isBlank()) return false
            if (CLOUD_HOST_MARKERS.any { host.contains(it) }) return false
            if (host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2") return true
            if (host.startsWith("10.")) return true
            if (host.startsWith("192.168.")) return true
            if (host.startsWith("172.")) return true
            false
        }.getOrDefault(false)
    }

    fun localBackendRequiredMessage(currentUrl: String): String =
        "Укажи «URL сервера на ПК» (http://IP:3000 из start-local-bff.bat). " +
            "Сейчас backend: ${currentUrl.ifBlank { "Railway по умолчанию" }} — телефон не доходит до ПК."

    /**
     * Common user mistake: puts BFF URL (:3000) into Ollama field.
     * If so, we can safely treat it as backend URL.
     */
    fun backendFromMistypedOllamaUrl(localUrl: String): String? {
        val trimmed = localUrl.trim()
        if (trimmed.isBlank()) return null
        return runCatching {
            val uri = URI(trimmed)
            val scheme = uri.scheme?.lowercase().orEmpty()
            val host = uri.host?.lowercase().orEmpty()
            val port = uri.port
            if (scheme != "http" || host.isBlank() || port != 3000) return null
            if (!isLanBackend("http://$host:3000")) return null
            "http://$host:3000"
        }.getOrNull()
    }
}
