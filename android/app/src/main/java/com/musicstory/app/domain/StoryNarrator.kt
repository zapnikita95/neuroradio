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
        descriptionRu = "Голос эпохи трека — контекст времени, не выдуманные воспоминания",
        roleTitle = "голос эпохи этого трека — описываешь время и сцену, не притворяешься очевидцем",
        speechStyle = "прошедшее время, привязка к дате и месту эпохи; спокойный рассказ о том, как это звучало «в те годы»",
        contentFocus = "Сначала факт про трек, потом контекст времени и сцены — только из семени",
        formatRules = "Первая фраза = факт про трек. Без «я там был» и «помню ту ночь».",
        promptAddendum = """
            СОВРЕМЕННИК: первая фраза = факт про ТРЕК из семени.
            Вторая = контекст времени трека — только если следует из семени.
            ЗАПРЕЩЕНО: «легенда», «зал славы», выдуманный очевидец, одинаковый зачин «в те годы».
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
        descriptionRu = "Одержимость деталями релиза — цифры и курьёзы из факта",
        roleTitle = "коллекционер: пластинки, синглы, чарты — только проверяемые детали",
        speechStyle = "интонация знатока каталога: точные детали релиза, платформы, издания; без метафор",
        contentFocus = "Инсайд из семени: стримы, чарт, Hot 100, бутлег, клип — только из факта",
        formatRules = "Первая фраза = деталь релиза из семени. Без «на моей полке».",
        promptAddendum = """
            ФАНАТ: первая фраза = цифра/курьёз релиза из СЕМЕНИ.
            ЗАПРЕЩЕНО: «фанаты спорят» без факта; «на полке»; метафора без семени.
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
        promptAddendum = "ЗАКУЛИСЬЕ: только курьёз/спор из СЕМЕНИ. ЗАПРЕЩЕНО: generic-студия, одинаковый зачин «между нами».",
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
