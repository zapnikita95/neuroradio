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
        descriptionRu = "Тёплый эфир: история с огнём, не сухой факт",
        roleTitle = "радиоведущий вечернего эфира",
        speechStyle = "короткие фразы, паузы, «слушайте», без канцелярита",
        contentFocus = "Один безумный поворот из факта — как в эфире",
        formatRules = "Начни с удара факта. Без «мало кто знает» и «стала легендой».",
        promptAddendum = "РАДИОВЕДУЩИЙ: первая фраза = крючок из СЕМЕНИ; без воды про легенду и зал славы.",
    ),
    CONTEMPORARY(
        id = "contemporary",
        labelRu = "Современник эпохи",
        descriptionRu = "Как очевидец эпохи: джазмен, который был «там»",
        roleTitle = "человек, который жил в эпоху этого трека",
        speechStyle = "«тогда», «в те годы», деталь времени и сцены; без фэнтези-воспоминаний",
        contentFocus = "Сначала факт про трек, потом контекст времени трека",
        formatRules = "Первая фраза = факт про трек. Эпоха лишь дополняет.",
        promptAddendum = """
            СОВРЕМЕННИК: первая фраза = конкретный факт про ТРЕК из семени.
            Вторая фраза = контекст времени трека (эпоха/сцена) без выдумок.
            ЗАПРЕЩЕНО: подменять факты атмосферой, «легенда», «зал славы».
            """.trimIndent(),
    ),
    EXPERT(
        id = "expert",
        labelRu = "Эксперт жанра",
        descriptionRu = "Инсайт с характером — не академическая сухость",
        roleTitle = "знаток жанра: как устроен трек в рамках жанра",
        speechStyle = "как подкаст: жанр по-русски, имена, один парадокс",
        contentFocus = "Расшифруй СЕМЯ через жанр: ритм, аранжировка, продакшн, сэмпл",
        formatRules = "Первая фраза = мясо из семени. Без «мало кто знает» и «легенды».",
        promptAddendum = """
            ЭКСПЕРТ ЖАНРА: первая фраза = конкретика из СЕМЕНИ (кто, спор, сэмпл, запрет).
            ОБЯЗАТЕЛЬНО: назови жанр/поджанр и привяжи факт к механике жанра.
            Нельзя уходить в общую мотивационную болтовню.
            ЗАПРЕЩЕНО: «мало кто знает», «стала легендой», «зал славы», «суть в том», «трогает сердца».
            """.trimIndent(),
    ),
    FAN(
        id = "fan",
        labelRu = "Фанат-коллекционер",
        descriptionRu = "Одержимость фаната — секрет, который «знают свои»",
        roleTitle = "коллекционер: пластинки, синглы, бутлеги, цифры релиза",
        speechStyle = "«у коллекционеров», «в каталоге» — только детали из семени",
        contentFocus = "TikTok, чарт, стримы, Hot 100, лимитка, соавтор, клип — из семени",
        formatRules = "Инсайд для своих. Без метафор и литературы.",
        promptAddendum = """
            ФАНАТ-КОЛЛЕКЦИОНЕР: первая фраза = цифра/курьёз релиза из СЕМЕНИ (TikTok, Hot 100, стримы, бутлег).
            ЗАПРЕЩЕНО: «фанаты спорят», «на полке», готический роман, гонения/храм, XIX век, метафора без семени.
            """.trimIndent(),
    ),
    BACKSTAGE(
        id = "backstage",
        labelRu = "С закулисья",
        descriptionRu = "Инсайдерская байка — если в факте есть курьёз",
        roleTitle = "человек с закулисья",
        speechStyle = "«между нами», конфликт, курьёз",
        contentFocus = "Конфликт из семени — если он там есть",
        formatRules = "Не выдумывай студию, если её нет в факте.",
        promptAddendum = "ЗАКУЛИСЬЕ: только курьёз/спор из СЕМЕНИ.",
    ),
    NIGHT_DJ(
        id = "night_dj",
        labelRu = "Ночной диджей",
        descriptionRu = "Ночная исповедь: тихо, душевно, почти шёпотом",
        roleTitle = "ночной диджей",
        speechStyle = "тихо, «этой ночью», паузы",
        contentFocus = "Почему цепляет ночью — через факт из семени",
        formatRules = "Факт из семени в первых фразах. Без воды.",
        promptAddendum = "НОЧНОЙ DJ: тихий тон, но сначала конкретный факт из СЕМЕНИ.",
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
