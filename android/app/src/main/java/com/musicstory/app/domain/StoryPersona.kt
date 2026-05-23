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
        /** Era hint for prompts only — model must NOT copy digits into script */
        fun eraContextForPrompt(year: Int?, genre: String?): String {
            val g = genre?.lowercase().orEmpty()
            if (g.contains("jazz") || g.contains("swing")) return "джазовая эпоха, клубы и джем-сейшены"
            if (g.contains("blues") || g.contains("soul")) return "soul и blues, южные клубы и ночные сцены"
            if (g.contains("rock") || g.contains("metal") || g.contains("punk")) return "рок-сцена, концерты и гаражи"
            if (g.contains("electronic") || g.contains("house") || g.contains("techno") || g.contains("dance")) {
                return "клубная электроника, склады и диджейские стыки"
            }
            if (g.contains("hip hop") || g.contains("rap")) return "хип-хоп с блока, уличные вечеринки"
            if (g.contains("pop")) return "поп-культура, радио и телевидение"
            if (year == null) return "эпоха артиста, без точных дат в тексте"
            if (year < 1960) return "ранний период, винил и живое радио"
            if (year < 1970) return "расцвет soul и rock, Apollo и Abbey Road"
            if (year < 1980) return "золотая эра рока и диско, большие залы"
            if (year < 1990) return "MTV, кассеты и громкие фестивали"
            if (year < 2000) return "клубы и ремиксы, переход в цифру"
            if (year < 2010) return "интернет-форумы и первые стримы"
            return "современная сцена, архивы и редкие концерты"
        }

        fun forTrack(year: Int?, genre: String?, artist: String): StoryPersona {
            val g = genre?.lowercase().orEmpty()
            val a = artist.lowercase()
            val era = eraContextForPrompt(year, genre)

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
                        "фанат хип-хопа с блока",
                        "поток, вечеринка на блоке, уличная честность",
                        "$era. битбокс, слова как оружие и щит",
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
