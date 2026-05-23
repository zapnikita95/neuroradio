package com.musicstory.app.domain

enum class StoryAngle(val labelRu: String) {
    RECORDING_SCENE("конкретная сцена записи или студийный курьёз"),
    FIRST_HEAR("где ты был, когда впервые услышал этот трек"),
    LIVE_MOMENT("живое выступление — что видел своими глазами"),
    BACKSTAGE("закулисье: кто спорил, что ломалось, что удивило"),
    FAN_DETAIL("деталь, которую фанаты замечают не с первого раза"),
    SCENE_GOSSIP("история из тусовки жанра в тот сезон"),
}

data class StoryPersona(
    val roleTitle: String,
    val speechStyle: String,
    val eraHint: String,
    val contentFocus: String? = null,
    val formatRules: String? = null,
) {
    companion object {
        fun eraContextForPrompt(
            year: Int?,
            genre: String?,
            countryCode: String? = null,
            artist: String = "",
            title: String = "",
        ): String = TrackLocaleResolver.eraContextForPrompt(year, genre, countryCode, artist, title)

        fun forTrack(
            year: Int?,
            genre: String?,
            artist: String,
            title: String = "",
            countryCode: String? = null,
        ): StoryPersona {
            val locale = TrackLocaleResolver.resolve(artist, title, year, genre, countryCode)
            val g = genre?.lowercase().orEmpty()
            val a = artist.lowercase()
            val era = locale.sceneHintRu

            return when {
                a.contains("james brown") || g.contains("funk") ->
                    personaForYear(
                        "парень из Гарлема, soul/funk, ходит в Apollo и знает каждый крик Brown",
                        "короткие рваные фразы, «слушай», «тогда», «та ночь», энергия сцены",
                        "$era. Apollo Theater, один дубль, номер с плащом",
                    )

                a.contains("elvis") ->
                    personaForYear(
                        "фанат rock'n'roll, собирает синглы Elvis",
                        "«помню», «тогда», «Король», без современного сленга",
                        "$era. студия RCA, телеспецвыпуски, реакция зала",
                    )

                g.contains("jazz") || g.contains("swing") || g.contains("bebop") ||
                    (year != null && year in 1935..1965 && (g.contains("blues") || g.isBlank())) ->
                    personaForYear(
                        "джазмен, одержим свингом и бибопом",
                        "«брат», «слушай сюда», джем-сейшены, импровизация",
                        "$era. винил, живое радио, ночные клубы",
                    )

                g.contains("blues") || g.contains("soul") ->
                    personaForYear(
                        "блюзовый меломан с юга или из клуба",
                        "«дитя», «та ночь», исповедь, гитара, пот на сцене",
                        "$era. ночной клуб, юг США",
                    )

                g.contains("rock") || g.contains("metal") || g.contains("punk") ||
                    g.contains("rock'n") ->
                    personaForYear(
                        "рок-фанат, был на концертах",
                        "«тот концерт», «мы были», громкость, бунт",
                        "$era. гаражи, фестивали",
                    )

                g.contains("electronic") || g.contains("house") || g.contains("techno") ||
                    g.contains("dance") ->
                    personaForYear(
                        "клубный меломан",
                        "брейк, сэмпл, бас, склад, ночь",
                        "$era. диджейские стыки, новая музыка из старых пластинок",
                    )

                g.contains("hip hop") || g.contains("rap") ->
                    personaForYear(
                        if (locale.countryCode == "RU") "фанат российского рэпа" else "фанат хип-хопа с блока",
                        if (locale.countryCode == "RU") {
                            "поток, площадки, студии, честная уличная речь"
                        } else {
                            "поток, вечеринка на блоке, уличная честность"
                        },
                        era,
                    )

                g.contains("country") || title.lowercase().contains("кантри") ->
                    personaForYear(
                        if (locale.countryCode == "RU") "фанат $artist, российская кантри-сцена" else "фанат $artist",
                        if (locale.countryCode == "RU") {
                            "живая речь, российские студии и площадки, без Nashville-клише"
                        } else {
                            "живая речь, уважение к эпохе трека"
                        },
                        era,
                    )

                g.contains("pop") || a.contains("beatles") || a.contains("abba") ->
                    personaForYear(
                        "обожатель поп-культуры",
                        "«то лето», «по радио», телевизор и магнитофоны",
                        "$era. телевидение, магнитофоны, кассеты",
                    )

                else ->
                    personaForYear(
                        "фанат $artist",
                        "живая речь, уважение к эпохе трека, без энциклопедичности",
                        era,
                    )
            }
        }

        private fun personaForYear(role: String, speech: String, era: String) =
            StoryPersona(roleTitle = role, speechStyle = speech, eraHint = era)

        fun pickAngle(previousCount: Int): StoryAngle {
            return StoryAngle.entries[previousCount % StoryAngle.entries.size]
        }
    }
}
