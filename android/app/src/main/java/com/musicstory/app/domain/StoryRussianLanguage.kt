package com.musicstory.app.domain

/**
 * Озвучка для русского слушателя: лatin вне «имя артиста» / «название трека» — брак.
 */
object StoryRussianLanguage {

    private val forbiddenPhrases = listOf(
        Regex("""native\s+american""", RegexOption.IGNORE_CASE),
        Regex("""\bbillboard\b""", RegexOption.IGNORE_CASE),
        Regex("""\btop[-\s]?5\b""", RegexOption.IGNORE_CASE),
        Regex("""\btop[-\s]?ten\b""", RegexOption.IGNORE_CASE),
        Regex("""#\s*\d"""),
        Regex("""\bnumber\s+one\b""", RegexOption.IGNORE_CASE),
        Regex("""\bshock\s+rock\b""", RegexOption.IGNORE_CASE),
        Regex("""\boverdub""", RegexOption.IGNORE_CASE),
        Regex("""\bmacabre\b""", RegexOption.IGNORE_CASE),
        Regex("""\bviral\b""", RegexOption.IGNORE_CASE),
        Regex("""\bperformance\b""", RegexOption.IGNORE_CASE),
        Regex("""\bultimate\s+pop\b""", RegexOption.IGNORE_CASE),
        Regex("""\bbootleg\b""", RegexOption.IGNORE_CASE),
        Regex("""\bsingle\b""", RegexOption.IGNORE_CASE),
        Regex("""\bband\b""", RegexOption.IGNORE_CASE),
        Regex("""\bchart\b""", RegexOption.IGNORE_CASE),
        Regex("""\blive\b""", RegexOption.IGNORE_CASE),
        Regex("""\bstudio\b""", RegexOption.IGNORE_CASE),
        Regex("""\btrack\b""", RegexOption.IGNORE_CASE),
        Regex("""\bsong\b""", RegexOption.IGNORE_CASE),
        Regex("""\bhit\b""", RegexOption.IGNORE_CASE),
        Regex("""\bmainstream\b""", RegexOption.IGNORE_CASE),
        Regex("""\bunderground\b""", RegexOption.IGNORE_CASE),
    )

    private val latinWord = Regex("""\b[a-z]{3,}\b""", RegexOption.IGNORE_CASE)

    fun hasEnglishLeak(script: String, artist: String = "", title: String = ""): Boolean {
        val text = script.trim()
        if (text.isBlank()) return false
        if (forbiddenPhrases.any { it.containsMatchIn(text) }) return true
        val withoutQuotes = text.replace(Regex("«[^»]*»"), " ")
        val stripped = stripAllowedNameTokens(withoutQuotes, artist, title)
        val noHybrids = stripped.replace(Regex("""\b[a-z]{2,}(?=-[\u0400-\u04FF])""", RegexOption.IGNORE_CASE), "")
        return latinWord.containsMatchIn(noHybrids)
    }

    private fun stripAllowedNameTokens(text: String, artist: String, title: String): String {
        var result = text
        for (source in listOf(artist, title)) {
            for (token in latinTokens(source)) {
                result = result.replace(Regex("\\b${Regex.escape(token)}\\b", RegexOption.IGNORE_CASE), " ")
            }
        }
        return result
    }

    private fun latinTokens(value: String): List<String> =
        value.split(Regex("[^\\p{L}\\p{N}]+"))
            .map { it.trim() }
            .filter { it.length >= 3 && it.any { ch -> ch in 'a'..'z' || ch in 'A'..'Z' } }

    val PROMPT_BLOCK = """
ЯЗЫК — ТОЛЬКО РУССКИЙ, ДЛЯ ОЗВУЧКИ:
- Весь текст по-русски. Лatinицу — только внутри «имя артиста» или «название трека»; дальше «он», «артист», «песня».
- Факты с Wikipedia на английском переводи мыслью, не копируй английские термины.
- ПЛОХО: «Native American на Billboard top-5», «#1 ABBA», «shock rock», «viral на Reddit», «overdub на tape».
- ХОРОШО: «индейская группа в пятёрке американского хит-парада», «единственное первое место ABBA в США», «шок-шоу на сцене», «вирусный ажиотаж на Reddit», «сотни дублей на плёнке».
- Запрещены английские слова вне кавычек с именем/названием: chart, band, single, live, performance, mainstream, underground и т.п.
""".trimIndent()
}
