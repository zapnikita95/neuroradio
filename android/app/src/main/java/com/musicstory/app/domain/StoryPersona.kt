package com.musicstory.app.domain

data class StoryPersona(
    val roleTitle: String,
    val speechStyle: String,
    val eraHint: String,
    val contentFocus: String? = null,
    val formatRules: String? = null,
    val narratorAddendum: String? = null,
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
                        "меломан soul/funk, знает сцену Apollo и живые выступления Brown",
                        "короткие рваные фразы, высокая энергия, уличная разговорная интонация",
                        "$era. Apollo Theater, живые дубли, сценические номера",
                    )

                a.contains("elvis") ->
                    personaForYear(
                        "коллекционер синглов rock'n'roll эпохи Elvis",
                        "ностальгический тон, прошедшее время, без современного сленга",
                        "$era. студия RCA, телеспецвыпуски, радиоэфир",
                    )

                g.contains("jazz") || g.contains("swing") || g.contains("bebop") ||
                    (year != null && year in 1935..1965 && (g.contains("blues") || g.isBlank())) ->
                    personaForYear(
                        "меломан джаза и свинга",
                        "свободный ритм фраз, жаргон джем-сейшенов, импровизационная подача",
                        "$era. винил, живое радио, ночные клубы",
                    )

                g.contains("blues") || g.contains("soul") ->
                    personaForYear(
                        "меломан блюза и соула",
                        "исповедальный тон, короткие образные фразы, интонация клубной сцены",
                        "$era. ночной клуб, юг США",
                    )

                g.contains("rock") || g.contains("metal") || g.contains("punk") ||
                    g.contains("rock'n") ->
                    personaForYear(
                        "рок-меломан, ходил на концерты",
                        "разговорный напор, воспоминания о живых выступлениях, громкая подача",
                        "$era. гаражи, фестивали",
                    )

                g.contains("electronic") || g.contains("house") || g.contains("techno") ||
                    g.contains("dance") ->
                    personaForYear(
                        "клубный меломан",
                        "ритмичные короткие фразы, лексика диджейской культуры, ночная интонация",
                        "$era. диджейские стыки, сэмплы, клубная сцена",
                    )

                g.contains("hip hop") || g.contains("rap") ->
                    personaForYear(
                        if (locale.countryCode == "RU") "фанат российского рэпа" else "фанат хип-хоп культуры",
                        if (locale.countryCode == "RU") {
                            "потоковая речь, студийный и уличный контекст, прямой тон"
                        } else {
                            "потоковая речь, уличный контекст, прямой тон"
                        },
                        era,
                    )

                g.contains("country") || title.lowercase().contains("кантри") ->
                    personaForYear(
                        if (locale.countryCode == "RU") "меломан $artist, российская кантри-сцена" else "меломан $artist",
                        if (locale.countryCode == "RU") {
                            "живая разговорная речь, российские студии и площадки"
                        } else {
                            "живая разговорная речь, уважение к эпохе трека"
                        },
                        era,
                    )

                g.contains("pop") || a.contains("beatles") || a.contains("abba") ->
                    personaForYear(
                        "меломан поп-культуры",
                        "ностальгический тон, контекст радио и телевидения эпохи",
                        "$era. телевидение, магнитофоны, кассеты",
                    )

                else ->
                    personaForYear(
                        "меломан $artist",
                        "живая разговорная речь, уважение к эпохе трека, без выдуманных воспоминаний",
                        era,
                    )
            }
        }

        private fun personaForYear(role: String, speech: String, era: String) =
            StoryPersona(roleTitle = role, speechStyle = speech, eraHint = era)
    }
}
