package com.musicstory.app.util

import com.musicstory.app.data.model.TrackInfo

/** Matches backend `normalizeStreamingTitle` — ignore Yandex/streaming suffixes. */
object TrackTitleNormalizer {
    private val fromFilmRu = Regex("""\s*\(из\s+фильма\s+[«"'].*?[»"']\)\s*$""", RegexOption.IGNORE_CASE)
    private val fromFilmEn = Regex(
        """\s*\(from\s+(?:the\s+)?(?:movie|film|soundtrack)\s+[^)]+\)\s*$""",
        RegexOption.IGNORE_CASE,
    )
    private val fromSeriesRu = Regex("""\s*\(из\s+сериала\s+[«"'].*?[»"']\)\s*$""", RegexOption.IGNORE_CASE)
    private val featSuffix = Regex(
        """\s*[\(\[\-–—]\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]+[\)\]]?\s*$""",
        RegexOption.IGNORE_CASE,
    )

    fun normalize(title: String): String {
        var t = title.trim()
        t = fromFilmRu.replace(t, "").trim()
        t = fromFilmEn.replace(t, "").trim()
        t = fromSeriesRu.replace(t, "").trim()
        t = featSuffix.replace(t, "").trim()
        return t.ifBlank { title.trim() }
    }

    fun normalizeArtist(artist: String): String {
        var a = artist.trim()
        a = Regex("""\s*,\s*[^,]+$""").replace(a, "").trim()
        return a.ifBlank { artist.trim() }
    }

    /** Stable identity for «same song» — ignores film/feat suffixes and «Artist, Guest». */
    fun matchKey(track: TrackInfo): String = matchKey(track.artist, track.title)

    fun matchKey(artist: String, title: String): String {
        val a = normalizeArtist(artist).trim().lowercase()
        val t = normalize(title).trim().lowercase()
        return "$a|$t"
    }
}
