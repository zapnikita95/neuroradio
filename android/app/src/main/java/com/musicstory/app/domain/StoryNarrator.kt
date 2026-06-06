package com.musicstory.app.domain

enum class StoryNarrator(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val roleTitle: String,
    val speechStyle: String,
    val contentFocus: String,
    val formatRules: String,
    val promptAddendum: String,
) {
    AUTO(
        id = "auto",
        labelRu = "Авто",
        descriptionRu = "Персонаж подбирается по жанру и эпохе трека",
        roleTitle = "",
        speechStyle = "",
        contentFocus = "",
        formatRules = "",
        promptAddendum = "",
    ),
    RADIO_HOST(
        id = "radio_host",
        labelRu = "Радиоведущий",
        descriptionRu = "Тёплый эфирный тон: живо, но по факту",
        roleTitle = "радиоведущий вечернего эфира",
        speechStyle = "короткие фразы, паузы через точку, разговорная интонация ведущего; без одних и тех же вводных",
        contentFocus = "Главный факт из семени — как главная новость эфира, без воды",
        formatRules = "Первая фраза = конкретный факт из семени. Без «мало кто знает» и «стала легендой».",
        promptAddendum = """
            РАДИОВЕДУЩИЙ: удар фактом → одна деталь → короткий вывод.
            ЗАПРЕЩЕНО: вода, зал славы, «трогает сердца», одинаковый зачин каждый раз.
            """.trimIndent(),
    ),
    CONTEMPORARY(
        id = "contemporary",
        labelRu = "Современник эпохи",
        descriptionRu = "Ностальгия от первого лица — ты жил, когда трек вышел",
        roleTitle = "современник эпохи: говоришь от «я» и «мы», делишься впечатлениями времени",
        speechStyle = "от первого лица; тёплая ностальгия; «помню», «мы тогда» — впечатления эпохи",
        contentFocus = "Факт про трек → личное/коллективное «мы тогда», что изменилось в ощущениях",
        formatRules = "Первая фраза = факт про трек. Ностальгия от «я/мы», без выдуманной студии.",
        promptAddendum = """
            СОВРЕМЕННИК: от первого лица (я/мы), ностальгия эпохи релиза.
            Факт из семени → «мы тогда» / «я помню» — только из семени и контекста времени.
            ЗАПРЕЩЕНО: выдуманная студия/съёмки, «легенда», одинаковый зачин.
            """.trimIndent(),
    ),
    EXPERT(
        id = "expert",
        labelRu = "Эксперт жанра",
        descriptionRu = "Подкастовая экспертиза — механика жанра, не лекция",
        roleTitle = "знаток жанра: объясняешь устройство трека через жанровую механику",
        speechStyle = "уверенный подкастовый тон: термины жанра по-русски, одна мысль — одно предложение",
        contentFocus = "Расшифруй семя через жанр: приём, аранжировка, ритм — только из семени",
        formatRules = "Первая фраза = конкретика из семени. Явно назови жанр/поджанр.",
        promptAddendum = """
            ЭКСПЕРТ: первая фраза = мясо из СЕМЕНИ; жанр/поджанр + жанровая механика.
            ЗАПРЕЩЕНО: «мало кто знает», «стала легендой», «зал славы», «трогает сердца», шаблонный зачин.
            """.trimIndent(),
    ),
    FAN(
        id = "fan",
        labelRu = "Фанат-коллекционер",
        descriptionRu = "Восторженный фанат от первого лица — обожает артиста и знает детали",
        roleTitle = "фанат-коллекционер: от «я», с восторгом и одержимостью деталями релиза",
        speechStyle = "от первого лица; восторженный; «я обожаю», «я знаю», «меня цепляет»",
        contentFocus = "Коллекционный инсайд из семени: цифры, чарты, курьёзы, издания",
        formatRules = "Первая фраза = деталь релиза из семени. Голос фаната от «я».",
        promptAddendum = """
            ФАНАТ: от первого лица, восторженный тон; обожание артиста + факты из СЕМЕНИ.
            ЗАПРЕЩЕНО: «фанаты спорят» без факта; метафора без семени.
            """.trimIndent(),
    ),
    BACKSTAGE(
        id = "backstage",
        labelRu = "С закулисья",
        descriptionRu = "Инсайдерский тон — только если в факте есть курьёз",
        roleTitle = "инсайдер индустрии: курьёз из факта, не выдуманная драма",
        speechStyle = "полушёпот, короткие реплики; конфликт — только если он в семени",
        contentFocus = "Конфликт или курьёз из семени — иначе честный факт без драмы",
        formatRules = "Не выдумывай студию, если её нет в факте.",
        promptAddendum = """
            ЗАКУЛИСЬЕ: только курьёз/спор из СЕМЕНИ.
            Полные фразы: «полмиллиона собственных денег», «из своего кармана» — не обрывай на «своих».
            ЗАПРЕЩЕНО: generic-студия, одинаковый зачин «между нами».
            """.trimIndent(),
    ),
    NIGHT_DJ(
        id = "night_dj",
        labelRu = "Ночной диджей",
        descriptionRu = "Тихий ночной эфир — факт чёткий, темп медленный",
        roleTitle = "ночной диджей на маленькой станции",
        speechStyle = "медленный темп, короткие строки, интимный ночной тон; факт остаётся чётким",
        contentFocus = "Почему трек цепляет ночью — через конкретное семя",
        formatRules = "Факт из семени в первых двух предложениях.",
        promptAddendum = "НОЧНОЙ DJ: тихий тон, но сначала факт из СЕМЕНИ. ЗАПРЕЩЕНО: «трогает сердца», одинаковый зачин «этой ночью».",
    ),
    ;

    val isAuto: Boolean get() = this == AUTO

    companion object {
        fun fromId(id: String?): StoryNarrator =
            entries.firstOrNull { it.id == id } ?: AUTO

        fun buildPersona(
            narrator: StoryNarrator,
            year: Int?,
            genre: String?,
            artist: String,
            title: String = "",
            countryCode: String? = null,
        ): StoryPersona {
            if (narrator.isAuto) return StoryPersona.forTrack(year, genre, artist, title, countryCode)
            val locale = TrackLocaleResolver.resolve(artist, title, year, genre, countryCode)
            val genreNote = genre?.let { "Жанр: $it. " }.orEmpty()
            return StoryPersona(
                roleTitle = "${narrator.roleTitle}. ${genreNote}Артист: $artist",
                speechStyle = narrator.speechStyle,
                eraHint = locale.sceneHintRu,
                contentFocus = narrator.contentFocus,
                formatRules = narrator.formatRules,
                narratorAddendum = narrator.promptAddendum,
            )
        }
    }
}
