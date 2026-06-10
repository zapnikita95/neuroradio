package com.musicstory.app.util

/** Force https — Android blocks cleartext HTTP in release (ERR_CLEARTEXT_NOT_PERMITTED). */
fun normalizeHttpsOrigin(raw: String?): String? {
    val trimmed = raw?.trim()?.trimEnd('/')?.takeIf { it.isNotBlank() } ?: return null
    val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        trimmed
    } else {
        "https://$trimmed"
    }
    return withScheme.replaceFirst(Regex("^http://", RegexOption.IGNORE_CASE), "https://")
        .substringBefore('?')
        .substringBefore('#')
        .trimEnd('/')
}
