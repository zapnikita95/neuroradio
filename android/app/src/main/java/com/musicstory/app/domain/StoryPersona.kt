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
) {
    companion object {
        fun forTrack(year: Int?, genre: String?, artist: String): StoryPersona {
            val g = genre?.lowercase().orEmpty()
            val a = artist.lowercase()
            val y = year ?: guessDecadeYear(artist)

            return when {
                a.contains("james brown") || g.contains("funk") ->
                    personaForYear(
                        y,
                        "парень из Harlem, soul/funk $y-х, ходит на Apollo и знает каждый scream Brown",
                        "речь mid-60s soul: короткие рваные фразы, «man», «look», «that night», энергия сцены",
                        "Apollo Theater, одно дубль, cape routine, James Brown Show",
                    )

                a.contains("elvis") ->
                    personaForYear(
                        y,
                        "фанат rock'n'roll $y-х, собирает синглы Elvis",
                        "речь 50–70-х: «помню», «тогда», «King», без современного сленга",
                        "RCA Studio, TV Specials, реакция зала, Sun Records в памяти старших",
                    )

                g.contains("jazz") || g.contains("swing") || g.contains("bebop") ||
                    (y in 1935..1965 && (g.contains("blues") || g.isBlank())) ->
                    personaForYear(
                        y,
                        "джазмен $y-х, одержим swing и bebop",
                        "лексика 40–60-х: «cat», «man», «dig this», джем-сейшены",
                        "Америка $y-х, джем-сейшены, винил, расовые барьеры, живое радио",
                    )

                g.contains("blues") || g.contains("soul") ->
                    personaForYear(
                        y,
                        "блюзовый меломан $y-х с юга или из клуба",
                        "лексика soul/blues: «child», «that night», исповедь, гитара, sweat",
                        "ночной клуб, юг США, гордость и боль в одной песне",
                    )

                g.contains("rock") || g.contains("metal") || g.contains("punk") ||
                    g.contains("rock'n") ->
                    personaForYear(
                        y,
                        "рок-фанат $y-х, был на концертах",
                        "лексика rock: «that gig», «we were», громкость, бунт",
                        "гаражи, фестивали, бунт против скучных правил",
                    )

                g.contains("electronic") || g.contains("house") || g.contains("techno") ||
                    g.contains("dance") ->
                    personaForYear(
                        y,
                        "клубный меломан $y-х",
                        "лексика dance: break, sample, bass, warehouse, ночь",
                        "warehouse, диджейские стыки, новая музыка из старых пластинок",
                    )

                g.contains("hip hop") || g.contains("rap") ->
                    personaForYear(
                        y,
                        "фанат хип-хопа $y-х с блока",
                        "лексика rap: flow, block party, уличная честность",
                        "битбокс, блок-вечеринки, слова как оружие и щит",
                    )

                g.contains("pop") || a.contains("beatles") || a.contains("abba") ->
                    personaForYear(
                        y,
                        "обожатель поп-культуры $y-х",
                        "лексика pop: «that summer», «on the radio», TV и магнитофоны",
                        "телевидение, магнитофоны, первые кассеты",
                    )

                y < 1970 ->
                    personaForYear(
                        y,
                        "современник $y-х, фанат $artist",
                        "лексика $y-х: винил, радио, «I remember»",
                        "мир до streaming, музыка как событие",
                    )

                y < 1990 ->
                    personaForYear(
                        y,
                        "меломан $y-х, коллекционер $artist",
                        "лексика 80-х: кассеты, Walkman, MTV",
                        "кассеты, Walkman, MTV",
                    )

                y < 2005 ->
                    personaForYear(
                        y,
                        "фанат $artist нулевых",
                        "лексика 2000-х: ремиксы, CD, форумы",
                        "интернет-форумы, ремиксы, первые mp3",
                    )

                else ->
                    personaForYear(
                        y,
                        "фанат $artist",
                        "современная речь, но уважение к эпохе трека",
                        "архивы, ремастеры, редкие live",
                    )
            }
        }

        private fun personaForYear(
            year: Int,
            role: String,
            speech: String,
            era: String,
        ) = StoryPersona(roleTitle = role, speechStyle = speech, eraHint = era)

        fun pickAngle(previousCount: Int): StoryAngle {
            return StoryAngle.entries[previousCount % StoryAngle.entries.size]
        }

        private fun guessDecadeYear(artist: String): Int {
            return 1955 + (artist.hashCode().and(0x7FFFFFFF) % 40)
        }
    }
}
