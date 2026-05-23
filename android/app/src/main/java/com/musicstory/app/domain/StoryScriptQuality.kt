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
        Regex("""забыл обо вс[её]м""", RegexOption.IGNORE_CASE),
        Regex("""танцевали на стульях""", RegexOption.IGNORE_CASE),
        Regex("""характерный.*рифф""", RegexOption.IGNORE_CASE),
        Regex("""подсказывает\s+[A-Za-z«]""", RegexOption.IGNORE_CASE),
        Regex("""^«?\s*я (?:сидел|вспоминаю) (?:в )?студии""", RegexOption.IGNORE_CASE),
        Regex("""^«?\s*сквозь миганье лампочек""", RegexOption.IGNORE_CASE),
    )

    private val concreteFactPattern = Regex(
        """(сэмпл|sample|перезапис|дубль|лейбл|продюсер|радио|телевиз|клип|чарт|billboard|гитар|барабан|клавиш|оркестр|сакс|труб|скрипк|микрофон|пластинк|кассет|vinyl|prado|pérez|перес|кавер|cover|remix|plagiar|запрет|скандал|плагиат|в эфир|на сцене|раздевалке|soundcheck|сведени|master|микш|репетиц|фестив|Apollo|Abbey|Columbia|EMI|MTV|Grammy|«[^»]{3,}»)""",
        RegexOption.IGNORE_CASE,
    )

    fun isTemplateLike(script: String): Boolean {
        val text = script.trim()
        if (text.isBlank()) return true
        if (templatePatterns.any { it.containsMatchIn(text) }) return true
        if (!concreteFactPattern.containsMatchIn(text)) return true
        return false
    }
}
