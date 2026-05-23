package com.musicstory.app.domain

object StoryScriptQuality {

    private val templatePatterns = listOf(
        Regex("""стоял у мониторов,\s*звукорежиссёры краснели""", RegexOption.IGNORE_CASE),
        Regex("""зал замолчал на первой ноте""", RegexOption.IGNORE_CASE),
        Regex("""стоял у радиолы""", RegexOption.IGNORE_CASE),
        Regex("""помню студию — при записи""", RegexOption.IGNORE_CASE),
        Regex("""фанат\s+\S+\s+настояли""", RegexOption.IGNORE_CASE),
        Regex("""микрофон еле остыл""", RegexOption.IGNORE_CASE),
        Regex("""прилетел из плейлиста, друзья пересылали в Telegram""", RegexOption.IGNORE_CASE),
        Regex("""влия(?:ет|ли|ющ)""", RegexOption.IGNORE_CASE),
        Regex("""легендарн""", RegexOption.IGNORE_CASE),
        Regex("""уникальн""", RegexOption.IGNORE_CASE),
        Regex("""суть в том, что""", RegexOption.IGNORE_CASE),
        Regex("""понял[а]?, что музыка""", RegexOption.IGNORE_CASE),
        Regex("""музыка может соедин""", RegexOption.IGNORE_CASE),
        Regex("""собирались по вечерам""", RegexOption.IGNORE_CASE),
        Regex("""забыл обо вс[eё]м""", RegexOption.IGNORE_CASE),
        Regex("""танцевали на стульях""", RegexOption.IGNORE_CASE),
        Regex("""характерный.*рифф""", RegexOption.IGNORE_CASE),
        Regex("""подсказывает\s+[A-Za-z«]""", RegexOption.IGNORE_CASE),
    )

    private val concreteFactPattern = Regex(
        """(сэмпл|sample|перезапис|дубль|лейбл|продюсер|радио|телевиз|клип|чарт|billboard|гитар|барабан|клавиш|оркестр|сакс|труб|скрипк|микрофон|пластинк|кассет|vinyl|prado|pérez|перес|кавер|cover|remix|plagiar|запрет|скандал|плагиат|в эфир|на сцене|раздевалке|soundcheck|сведени|master|микш|репетиц|фестив|Apollo|Abbey|Columbia|EMI|MTV|Grammy|песн|трек|альбом|сингл|куплет|мелоди|исполн|запис|верси|оркестр|джаз|свинг|рок|блюз|саксоф|фортеп|ударн|вокал|хор|дириж|композ|arrang|оригинал|перевод|эфир|премьер|релиз|дебют|soundtrack|сцен|зал|студи|концерт|пластин|винил|кассет|радиол|припев|бридж|solo|соло|«[^»]{2,}»)""",
        RegexOption.IGNORE_CASE,
    )

    fun isTemplateLike(script: String, artist: String = "", title: String = ""): Boolean {
        val text = script.trim()
        if (text.isBlank()) return true
        if (hasBannedPattern(text)) return true
        if (hasConcreteFact(text, artist, title)) return false
        return true
    }

    fun hasBannedPattern(script: String): Boolean =
        templatePatterns.any { it.containsMatchIn(script.trim()) }

    private fun normalizeForMatch(text: String): String =
        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()

    private fun significantTokens(raw: String): List<String> =
        normalizeForMatch(raw).split(' ').filter { it.length >= 3 }

    private fun hasConcreteFact(script: String, artist: String, title: String): Boolean {
        if (Regex("""«[^»]{2,}»""").containsMatchIn(script)) return true
        val scriptNorm = normalizeForMatch(script)
        if (significantTokens(artist).any { scriptNorm.contains(it) }) return true
        if (significantTokens(title).any { it.length >= 4 && scriptNorm.contains(it) }) return true
        return concreteFactPattern.containsMatchIn(script)
    }
}
