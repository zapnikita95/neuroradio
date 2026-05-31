package com.musicstory.app.util

object ApiKeySanitizer {
    /** Paste from clipboard often includes newlines — OkHttp rejects them in headers. */
    fun clean(raw: String): String =
        raw
            .replace("\uFEFF", "")
            .replace(Regex("[\\s\\n\\r]+"), "")
            .trim()
}
