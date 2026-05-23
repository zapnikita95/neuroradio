package com.musicstory.app.domain

enum class StoryAngle(val labelRu: String) {
    RECORDING_SECRET("скрытая деталь записи или продакшена"),
    CULTURE_CONTEXT("культурный контекст эпохи, что происходило вокруг"),
    ARTIST_OBSESSION("одержимость фаната этим артистом и его стилем"),
    LIVE_MOMENT("концерт, клуб, репетиция, живое выступление"),
    HIDDEN_MEANING("смысл, который не слышат при беглом прослушивании"),
    SCENE_GOSSIP("история из закулисья жанра или сцены"),
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
                a.contains("elvis") ->
                    personaForYear(y, "фанат rock'n'roll и soul $y-х, коллекционирует синглы Elvis",
                        "речь 50–70-х: «слушай», «вот что», уважение к King, без сленга другой эпохи",
                        "Телевизионные шоу, RCA Studio, Las Vegas, реакция зала важнее чартов")

                g.contains("jazz") || g.contains("swing") || g.contains("bebop") ||
                    (y in 1935..1965 && (g.contains("blues") || g.isBlank())) ->
                    personaForYear(y, "джазмен $y-х, одержим swing и bebop",
                        "лексика 40–60-х: «cat», «man», «dig this», дым, джем-сейшены, уважение к мастерам",
                        "Америка $y-х, джем-сейшены, винил, расовые барьеры, живое радио")

                g.contains("blues") || g.contains("soul") ->
                    personaForYear(y, "блюзовый меломан $y-х",
                        "лексика soul/blues: «слушай», «child», исповедь, гитара, ночной клуб",
                        "юг США или городской клуб, боль и гордость в одной песне")

                g.contains("rock") || g.contains("metal") || g.contains("punk") ||
                    g.contains("rock'n") ->
                    personaForYear(y, "рок-фанат $y-х",
                        "лексика rock $y-х: «вот что», «слушай сюда», громкость, бунт, концертный зал",
                        "гаражи, фестивали, бунт против скучных правил")

                g.contains("electronic") || g.contains("house") || g.contains("techno") ||
                    g.contains("dance") ->
                    personaForYear(y, "клубный меломан $y-х",
                        "лексика dance/electronic: break, sample, бас, warehouse, ночь без сна",
                        "warehouse, диджейские стыки, новая музыка из старых пластинок")

                g.contains("hip hop") || g.contains("rap") ->
                    personaForYear(y, "фанат хип-хопа $y-х",
                        "лексика rap $y-х: flow, block party, уличная честность, уважение к MC",
                        "битбокс, блок-вечеринки, слова как оружие и щит")

                g.contains("pop") || a.contains("beatles") || a.contains("abba") ->
                    personaForYear(y, "обожатель поп-культуры $y-х",
                        "лексика pop $y-х: «ты представляешь?», лёгкий юмор, радио и TV",
                        "телевидение, магнитофоны, первые кассеты")

                y < 1970 ->
                    personaForYear(y, "современник $y-х, фанат $artist",
                        "лексика $y-х: винил, радио, уважение к старой школе",
                        "мир до streaming, музыка как событие")

                y < 1990 ->
                    personaForYear(y, "меломан $y-х, коллекционер $artist",
                        "лексика $y-х: кассеты, Walkman, MTV, «слушай сюда»",
                        "кассеты, Walkman, первые MTV-образы")

                y < 2005 ->
                    personaForYear(y, "фанат $artist нулевых",
                        "лексика 2000-х: ремиксы, файлообмен, CD-rip, «короче»",
                        "интернет-форумы, ремиксы, первые mp3")

                else ->
                    personaForYear(y, "фанат $artist, копает глубже стриминга",
                        "современная речь, но уважение к эпохе трека — без чужого сленга",
                        "архивы, ремастеры, редкие live")
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
