package com.musicstory.app.domain

/**
 * Отсеивает энциклопедичную сухость и ранжирует факты с человеческой драмой:
 * прорывы, скандалы, возвращения из забвения, смысл песни — не «изначально называлась».
 */
object ReferenceFactQuality {

    const val MIN_PICK_INTEREST_SCORE = 6

    private val boringPatterns = listOf(
        Regex("""\bconsists?\s+of\b""", RegexOption.IGNORE_CASE),
        Regex("""\bcomposed\s+of\b""", RegexOption.IGNORE_CASE),
        Regex("""\bline[- ]?up\b""", RegexOption.IGNORE_CASE),
        Regex("""\bmembers?\s+(?:are|include|were)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:duo|trio|quartet)\s+(?:of|comprising|consisting)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:musical\s+)?(?:duo|band|group)\s+from\b""", RegexOption.IGNORE_CASE),
        Regex("""\bis\s+an?\s+(?:American|British|Canadian|Russian|Ukrainian|Swedish|German|French|Japanese|Korean|Australian)\s+(?:musical\s+)?(?:duo|band|group|artist|rock\s+band)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bis\s+a\s+song\s+by\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:was|were)\s+formed\s+in\b""", RegexOption.IGNORE_CASE),
        Regex("""\boriginally\s+formed\b""", RegexOption.IGNORE_CASE),
        Regex("""\boriginally\s+(?:titled|called|named|released)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bworking\s+title\b""", RegexOption.IGNORE_CASE),
        Regex("""\bunder\s+the\s+name\b""", RegexOption.IGNORE_CASE),
        Regex("""\bpromo(?:tion(?:al)?)?\s+(?:track|single)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bfeatured\s+on\s+(?:their|the|its)\s+(?:\w+\s+){0,3}album\b""", RegexOption.IGNORE_CASE),
        Regex("""\bfifth\s+album\b""", RegexOption.IGNORE_CASE),
        Regex("""\bfirst\s+single\b""", RegexOption.IGNORE_CASE),
        Regex("""\breleased\s+as\s+(?:the|a)\s+(?:album'?s\s+)?single\b""", RegexOption.IGNORE_CASE),
        Regex("""\bwritten\s+and\s+produced\s+by\b""", RegexOption.IGNORE_CASE),
        Regex("""\bwritten\s+by\s+band\s+members\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:has|have)\s+released\s+\d+\s+(?:studio\s+)?albums?\b""", RegexOption.IGNORE_CASE),
        Regex("""\bdiscography\b""", RegexOption.IGNORE_CASE),
        Regex("""\bTyler\s+(?:Joseph|Robert)?\s+and\s+Josh\b""", RegexOption.IGNORE_CASE),
        Regex("""\bсостав\s+(?:группы|дуэта)?\b""", RegexOption.IGNORE_CASE),
        Regex("""\bсосто(?:ит|ял)\s+из\b""", RegexOption.IGNORE_CASE),
        Regex("""\bвыпустил(?:и)?\s+\d+\s+альбом""", RegexOption.IGNORE_CASE),
        Regex("""\bthe\s+lyrics\s+(?:are|were|narrate)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bcomposition\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:appeared|featured|used)\s+in\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:advert|commercial|ad\s+campaign)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bRimmel\b""", RegexOption.IGNORE_CASE),
        Regex("""\bDie\s+Hard\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:EA\s+Sports|FIFA|Rugby\s+06|video\s+game)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bsoundtracks?\s+(?:of|for)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bgoing\s+gold\b""", RegexOption.IGNORE_CASE),
        Regex("""\bselling\s+(?:nearly\s+)?(?:a\s+)?million\b""", RegexOption.IGNORE_CASE),
        Regex("""\bset\s+the\s+group\s+off\s+to\s+a\s+good\s+start\b""", RegexOption.IGNORE_CASE),
        Regex("""\bappears?\s+on\s+the\s+soundtracks?\s+of\s+EA\b""", RegexOption.IGNORE_CASE),
        Regex("""\bappears?\s+on\s+the\s+albums?\b""", RegexOption.IGNORE_CASE),
        Regex("""\bcertified\s+gold\b""", RegexOption.IGNORE_CASE),
        Regex("""\bselling\s+over\s+a\s+million\b""", RegexOption.IGNORE_CASE),
        Regex("""\bcharting\s+high\s+on\s+music\b""", RegexOption.IGNORE_CASE),
        Regex("""\baccessible\s+to\s+a\s+mainstream\b""", RegexOption.IGNORE_CASE),
        Regex("""\bbest-selling\s+songs?\s+of\s+all\s+time\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:cover|кавер)[- ]?versions?\b""", RegexOption.IGNORE_CASE),
        Regex("""\bwere\s+recorded\s+by\b""", RegexOption.IGNORE_CASE),
        Regex("""\bкавер[- ]?верси""", RegexOption.IGNORE_CASE),
        Regex("""музыкантами были записаны кавер""", RegexOption.IGNORE_CASE),
        Regex("""\brecorded\s+cover\s+versions\b""", RegexOption.IGNORE_CASE),
    )

    private val highImpactPatterns = listOf(
        Regex("""\b(?:hidden|secret|disguised|misunderstood|ironic|paradox)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:invocation|incantation|chant|orix|umbanda|candombl|syncret|goddess|deity|ritual)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:underlying|borrowed|adapted|derived|sampled|based on|earlier|predates)\b.*\b(?:melody|motif|recording|song)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:more\s+(?:well\s+)?known|better\s+known|definitive)\b.*\b(?:cover|version|arrangement)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:refused|denied|rejected|left early|return flight|racism|racial|barber|lawsuit|sued|plagiar)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:could not read|didn't know|never learned).*(?:music|notes)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:wrote|composed).*(?:army|military|prison)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:скрыт|заклинан|заимствован|мотив|плагиат|расизм|отказал|суд|арми|не умел|кавер)\b""", RegexOption.IGNORE_CASE),
    )

    private val weakTriviaPatterns = listOf(
        Regex("""\b(?:title|name)\b.*\b(?:means|meaning|translat)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:reached|peaked|charted)\s+(?:number\s+)?(?:one|#\s*\d|\d+\s+on)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bbillboard\b|\bhot 100\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:inducted|hall of fame|greatest.*song)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:название|перевод|означает)\b""", RegexOption.IGNORE_CASE),
    )

    private val collectorPatterns = listOf(
        Regex("""\b(?:tiktok|spotify|youtube|apple\s+music|streaming)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:billion|million)\b.*\b(?:streams?|plays|views?)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:streams?|plays)\b.*\b(?:billion|million|spotify)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:hot\s+100|billboard)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bco[- ]?writ(?:ten|er)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:bush\s+doof|music\s+video|official\s+video)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:limited\s+edition|vinyl|pressing|bootleg|b[- ]?side|cassette|7[- ]?inch)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:did\s+not\s+chart|charted)\b.*\b(?:until|following|after)\b""", RegexOption.IGNORE_CASE),
    )

    fun isCollectorFact(fact: String): Boolean =
        collectorPatterns.any { it.containsMatchIn(fact) }

    private val storyPatterns = listOf(
        Regex("""\b(?:historic|historical|legendary|breakthrough|milestone|revival|resurg|comeback|forgotten|oblivion|rediscover)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:Guardians\s+of\s+the\s+Galaxy|interest\s+increased|resurged|viral|phenomenon)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:segregat|racial|illegal|defied|banned|forbidden|controvers|scandal|protest|censored|lawsuit|plagiar)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:slavery|mining|union|strike|poverty|working\s+class|prison|deport|coal\s+miner|company\s+store|owe\s+my\s+soul)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:Carnegie\s+Hall|Apollo\s+Theater|Woodstock|Grammy|Oscar|Eurovision|King\s+of\s+Swing|coming\s+out\s+party)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:audience|crowd|fans|screamed|tears|cheered|went\s+wild|standing\s+ovation)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:obsessed|wild|primitive|shaman|explosive|electric)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:meaning|metaphor|written\s+(?:about|after|during|in\s+response)|inspired\s+by|based\s+on\s+(?:a|the|his|her|true))\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:took\s+issue|disagreed|argued|nearly\s+(?:didn't|dropped)|rejected\s+at\s+first|refused|described|attempt\s+to\s+write)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:platinum|gold|number\s+one|topped|billboard\s+hot\s+100)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:прорыв|скандал|запрет|возвращени|забвени|слёз|зал\s+взорвал|историческ|впервые|расизм|сегрегац|шахт|рабств|забастов|смысл|метафор|вдохновлен)\b""", RegexOption.IGNORE_CASE),
    )

    fun isBoringFact(fact: String): Boolean {
        val trimmed = fact.trim()
        if (trimmed.length < 30) return true
        if (isCollectorFact(trimmed)) return false
        if (boringPatterns.any { it.containsMatchIn(trimmed) }) return true
        if (interestScore(trimmed) < 4) return true
        return false
    }

    fun interestScore(fact: String): Int {
        var score = 0
        if (isCollectorFact(fact)) score += 8
        for (pattern in storyPatterns) {
            if (pattern.containsMatchIn(fact)) score += 5
        }
        if (Regex("""\b(first|only|never|breakthrough|surprise)\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact)) {
            score += 3
        }
        if (Regex("""\b(million|billion|decade|generation)\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact)) {
            score += 2
        }
        // Штраф за сухую дискографию
        if (Regex("""\boriginally\s+(?:titled|called|named)\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact)) {
            score -= 20
        }
        if (Regex("""\b(?:promo|album'?s first single|video game)\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact)) {
            score -= 8
        }
        val mediaHits = Regex(
            """\b(?:film|movie|advert|commercial|soundtrack|video game|FIFA|Rugby|Rimmel|Die Hard|EA Sports)\b""",
            RegexOption.IGNORE_CASE,
        ).findAll(fact).count()
        if (mediaHits >= 2) score -= 20
        if (Regex("""\b(?:appeared|featured|used)\s+in\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact) &&
            !Regex("""\b(?:scandal|controvers|banned|illegal|defied)\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact)
        ) {
            score -= 12
        }
        if (Regex("""\babout\s+(?:a|the|his|her)\s+\w+""", RegexOption.IGNORE_CASE).containsMatchIn(fact) &&
            Regex("""\b(?:miner|mine|coal|love|war|death|life|pain|protest)\b""", RegexOption.IGNORE_CASE).containsMatchIn(fact)
        ) {
            score += 5
        }
        if (isCollectorFact(fact)) return score
        for (pattern in highImpactPatterns) {
            if (pattern.containsMatchIn(fact)) score += 6
        }
        for (pattern in weakTriviaPatterns) {
            if (pattern.containsMatchIn(fact)) score -= 10
        }
        return score
    }

    fun filterAndRank(facts: List<String>, max: Int = 6): List<String> =
        facts
            .map { it.trim() }
            .filter { it.length >= 35 }
            .distinctBy { normalize(it) }
            .sortedByDescending { interestScore(it) }
            .filterNot { isBoringFact(it) }
            .take(max)

    private fun normalize(text: String): String =
        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()
}
