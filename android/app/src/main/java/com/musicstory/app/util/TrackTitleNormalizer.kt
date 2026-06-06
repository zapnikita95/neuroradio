package com.musicstory.app.util

/** Matches backend `normalizeStreamingTitle` — ignore Yandex/streaming suffixes. */
object TrackTitleNormalizer {
    private val fromFilmRu = Regex("""\s*\(из\s+фильма\s+[«"'].*?[»"']\)\s*$""", RegexOption.IGNORE_CASE)
    private val fromFilmEn = Regex(
        """\s*\(from\s+(?:the\s+)?(?:movie|film|soundtrack)\s+[^)]+\)\s*$""",
        RegexOption.IGNORE_CASE,
    )
    private val fromSeriesRu = Regex("""\s*\(из\s+сериала\s+[«"'].*?[»"']\)\s*$""", RegexOption.IGNORE_CASE)

    fun normalize(title: String): String {
        var t = title.trim()
        t = fromFilmRu.replace(t, "").trim()
        t = fromFilmEn.replace(t, "").trim()
        t = fromSeriesRu.replace(t, "").trim()
        return t.ifBlank { title.trim() }
    }
}
