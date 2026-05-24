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
        Regex("""^я помню""", RegexOption.IGNORE_CASE),
        Regex("""^я (?:был|была) в клубе""", RegexOption.IGNORE_CASE),
        Regex("""^я (?:помню|был|была), когда впервые""", RegexOption.IGNORE_CASE),
        Regex("""^на сцене артист начинает""", RegexOption.IGNORE_CASE),
        Regex("""я помню студию""", RegexOption.IGNORE_CASE),
        Regex("""^я помогаю в студии""", RegexOption.IGNORE_CASE),
        Regex("""^я сижу в студии""", RegexOption.IGNORE_CASE),
        Regex("""^я (?:работаю|стою) в студии""", RegexOption.IGNORE_CASE),
        Regex("""в этой студии происходит""", RegexOption.IGNORE_CASE),
        Regex("""магических дубл""", RegexOption.IGNORE_CASE),
        Regex("""вокалисты суетятся""", RegexOption.IGNORE_CASE),
        Regex("""достичь совершенства""", RegexOption.IGNORE_CASE),
        Regex("""все зависит от продюсера""", RegexOption.IGNORE_CASE),
        Regex("""их звуки доносились""", RegexOption.IGNORE_CASE),
        Regex("""^мы знали""", RegexOption.IGNORE_CASE),
        Regex("""мы с друзьями""", RegexOption.IGNORE_CASE),
        Regex("""^мы слушали""", RegexOption.IGNORE_CASE),
        Regex("""стоял у микрофона""", RegexOption.IGNORE_CASE),
        Regex("""разлетелся по всей стране""", RegexOption.IGNORE_CASE),
        Regex("""помогаюсь""", RegexOption.IGNORE_CASE),
        Regex("""помогаю(?:сь)?\s+в\s+создании""", RegexOption.IGNORE_CASE),
        Regex("""как это происходит на студии""", RegexOption.IGNORE_CASE),
        Regex("""работают вместе""", RegexOption.IGNORE_CASE),
        Regex("""\bсосредоточен""", RegexOption.IGNORE_CASE),
        Regex("""\bбрэд\b""", RegexOption.IGNORE_CASE),
        Regex("""brad\s+sullivan""", RegexOption.IGNORE_CASE),
    )

    fun isTemplateLike(
        script: String,
        artist: String = "",
        title: String = "",
        referenceFacts: List<String> = emptyList(),
        countryCode: String? = null,
        year: Int? = null,
        strictReferenceAnchor: Boolean = true,
    ): Boolean {
        val text = script.trim()
        if (text.isBlank()) return true
        if (hasBannedPattern(text)) return true
        if (hasLocaleViolation(text, countryCode, year)) return true
        if (hasFictionPattern(text)) return true
        if (hasDryEncyclopediaTone(text)) return true
        if (StoryRussianLanguage.hasEnglishLeak(text, artist, title)) return true
        if (referenceFacts.isNotEmpty()) {
            if (strictReferenceAnchor) {
                return !anchorsReferenceFact(text, referenceFacts)
            }
            return false
        }
        return !hasConcreteFact(text, artist, title)
    }

    fun hasBannedPattern(script: String): Boolean =
        templatePatterns.any { it.containsMatchIn(script.trim()) }

    fun hasFictionPattern(script: String): Boolean {
        val lower = script.lowercase()
        if (Regex("""^мы\b""").containsMatchIn(lower)) return true
        if (Regex("""\bмы (?:знали|слушали|были|сидели|ходили)""").containsMatchIn(lower)) return true
        if (Regex("""\b(?:помогаю|помогаюсь)\b""").containsMatchIn(lower)) return true
        if (Regex("""\bработают вместе\b""").containsMatchIn(lower)) return true
        if (Regex("""\bсосредоточен""").containsMatchIn(lower)) return true
        if (Regex("""как это происходит на студии""").containsMatchIn(lower)) return true
        if (Regex("""\b(?:основатель|основател)\b""").containsMatchIn(lower) &&
            !Regex("""\b(?:основан|основана|основано|основал)\b""").containsMatchIn(lower)
        ) {
            return true
        }
        if (Regex("""\bбрэд\b""", RegexOption.IGNORE_CASE).containsMatchIn(script)) return true
        if (Regex("""brad\s+sullivan""", RegexOption.IGNORE_CASE).containsMatchIn(script)) return true
        if (Regex("""\b(?:его|её|их)\s+команда\b""").containsMatchIn(lower) &&
            Regex("""\bстуди""").containsMatchIn(lower)
        ) {
            return true
        }
        return false
    }

    fun hasDryEncyclopediaTone(script: String): Boolean {
        val lower = script.lowercase()
        val dryPatterns = listOf(
            Regex("""изначально\s+называл"""),
            Regex("""рабоч(?:ее|ее)\s+назван"""),
            Regex("""(?:american|british|американск)\w*\s+(?:band|group|дуэт|группа)"""),
            Regex("""(?:группа|дуэт|band)\s+из\s+"""),
            Regex("""выпущен(?:а|ы)?\s+(?:как\s+)?(?:сингл|single)"""),
            Regex("""promo(?:tion(?:al)?)?\s+(?:track|single)"""),
            Regex("""(?:fifth|third|second)\s+album"""),
            Regex("""состо(?:ит|ял)\s+из"""),
            Regex("""written\s+and\s+produced\s+by"""),
            Regex("""(?:реклам|саундтрек|soundtrack|fifa|rugby|rimmel|die hard|ea sports)""", RegexOption.IGNORE_CASE),
        )
        return dryPatterns.any { it.containsMatchIn(lower) }
    }

    fun hasLocaleViolation(script: String, countryCode: String?, year: Int?): Boolean {
        val lower = script.lowercase()
        val isRussian = countryCode?.uppercase() == "RU"
        val mentionsRuSocial = Regex("""\b(vk|вконтакт|telegram|телеграм|instagram|инстаграм)\b""")
            .containsMatchIn(lower)
        if (!isRussian && mentionsRuSocial) return true
        if (year != null && year < 2006 && mentionsRuSocial) return true
        if (!isRussian && Regex("""\b(яндекс|yandex)\b""").containsMatchIn(lower)) return true
        return false
    }

    fun anchorsReferenceFact(script: String, referenceFacts: List<String>): Boolean {
        if (referenceFacts.isEmpty()) return true
        val scriptWords = significantWords(script).toSet()
        return referenceFacts.any { fact ->
            val factWords = significantWords(fact)
            if (factWords.isNotEmpty()) {
                val hits = factWords.count { it in scriptWords }
                val required = when {
                    factWords.size <= 2 -> factWords.size
                    else -> maxOf(2, (factWords.size * 0.35).toInt())
                }
                if (hits >= required) return@any true
            }
            matchesConceptBridge(fact, scriptWords)
        }
    }

    private fun matchesConceptBridge(fact: String, scriptWords: Set<String>): Boolean {
        val bridges = listOf(
            Regex("""native american""", RegexOption.IGNORE_CASE) to listOf("индейск", "коренн", "плем"),
            Regex("""billboard|hot 100|\bchart\b""", RegexOption.IGNORE_CASE) to listOf("чарт", "хит", "парад"),
            Regex("""top five|top 5|top-five|top ten|top 10""", RegexOption.IGNORE_CASE) to listOf("пятёрк", "десятк", "топ"),
            Regex("""number one|#\s*1|no\.?\s*1\b""", RegexOption.IGNORE_CASE) to listOf("перв", "единствен", "лидер", "номер"),
            Regex("""\bbootleg""", RegexOption.IGNORE_CASE) to listOf("бутлег", "подпол", "нелегал", "магнит"),
            Regex("""segregat|racial|integrat""", RegexOption.IGNORE_CASE) to listOf("сегрегац", "расов", "интегр", "черн"),
            Regex("""\bminer|\bcoal|\bmining""", RegexOption.IGNORE_CASE) to listOf("шахт", "уголь", "шахтёр"),
            Regex("""overdub|multi-?track|tape generation""", RegexOption.IGNORE_CASE) to listOf("дубл", "плёнк", "налож", "поколен"),
            Regex("""shock rock|macabre|theatrical""", RegexOption.IGNORE_CASE) to listOf("шок", "театр", "сцен", "безум"),
            Regex("""\bviral\b|reddit|discord""", RegexOption.IGNORE_CASE) to listOf("вирус", "reddit", "discord", "ажиотаж", "форум"),
            Regex("""cobain|pixies|pop song""", RegexOption.IGNORE_CASE) to listOf("кобейн", "pixies", "поп", "панк"),
            Regex("""\bband\b|\bgroup\b""", RegexOption.IGNORE_CASE) to listOf("групп", "коллект"),
            Regex("""u\.?\s?s\.?\s?ssr|soviet""", RegexOption.IGNORE_CASE) to listOf("ссср", "совет", "подпол"),
        )
        return bridges.any { (pattern, tokens) ->
            pattern.containsMatchIn(fact) && tokens.any { token -> scriptWords.any { word -> word.contains(token) } }
        }
    }

    private fun normalizeForMatch(text: String): String =
        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()

    private fun significantWords(text: String): List<String> =
        normalizeForMatch(text).split(' ').filter { it.length >= 4 }

    private fun significantTokens(raw: String): List<String> =
        normalizeForMatch(raw).split(' ').filter { it.length >= 3 }

    private fun hasConcreteFact(script: String, artist: String, title: String): Boolean {
        if (Regex("""«[^»]{2,}»""").containsMatchIn(script)) return true
        val scriptNorm = normalizeForMatch(script)
        if (significantTokens(artist).any { scriptNorm.contains(it) }) return true
        if (significantTokens(title).any { it.length >= 4 && scriptNorm.contains(it) }) return true
        return false
    }
}
