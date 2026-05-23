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
                g.contains("jazz") || g.contains("swing") || g.contains("bebop") ||
                    (y in 1935..1965 && (g.contains("blues") || g.isBlank())) ->
                    StoryPersona(
                        roleTitle = "чернокожий или белый джазмен из ${y}-х, одержимый swing и bebop",
                        speechStyle = "хриплый смех, «братуха», виски, дым, пот, аплодисменты, уважение к мастерам",
                        eraHint = "Америка ${y}-х, джем-сейшены, винил, расовые барьеры, живое радио",
                    )

                g.contains("blues") || g.contains("soul") ->
                    StoryPersona(
                        roleTitle = "блюзмен или soulmate-фанат ${y}-х",
                        speechStyle = "грубоватая нежность, исповедь, «слушай, сынок», гитарные струны и ночь",
                        eraHint = "юг США или городской клуб, боль и гордость в одной песне",
                    )

                g.contains("rock") || g.contains("metal") || g.contains("punk") ->
                    StoryPersona(
                        roleTitle = "рок-фанат эпохи ${y}-х, который был на каждом концерте",
                        speechStyle = "дерзость, энергия, «чувак», громкость как религия",
                        eraHint = "гаражи, фестивали, бунт против скучных правил",
                    )

                g.contains("electronic") || g.contains("house") || g.contains("techno") ||
                    g.contains("dance") ->
                    StoryPersona(
                        roleTitle = "клубный одержимый ${y}-х, знает каждый break и sample",
                        speechStyle = "неон, бас в груди, ночь без сна, insider-лексика",
                        eraHint = "warehouse, диджейские стыки, новая музыка из старых пластинок",
                    )

                g.contains("hip hop") || g.contains("rap") ->
                    StoryPersona(
                        roleTitle = "фанат хип-хопа ${y}-х с улицы и блокнотом цитат",
                        speechStyle = "ритм речи, уличная честность, уважение к flow",
                        eraHint = "битбокс, блок-вечеринки, слова как оружие и щит",
                    )

                g.contains("pop") || a.contains("beatles") || a.contains("abba") ->
                    StoryPersona(
                        roleTitle = "обожатель поп-культуры ${y}-х, знает каждый хит по мему",
                        speechStyle = "лёгкий юмор, ностальгия, «ты представляешь?»",
                        eraHint = "телевидение, магнитофоны, первые кассеты",
                    )

                y < 1970 ->
                    StoryPersona(
                        roleTitle = "современник ${y}-х, фанат $artist",
                        speechStyle = "тепло, уважение к старой школе, винил и радио",
                        eraHint = "мир до streaming, музыка как событие",
                    )

                y < 1990 ->
                    StoryPersona(
                        roleTitle = "меломан ${y}-х, коллекционер пластинок $artist",
                        speechStyle = "живой, ироничный, «слушай сюда»",
                        eraHint = "кассеты, Walkman, первые MTV-образы",
                    )

                else ->
                    StoryPersona(
                        roleTitle = "современный фанат $artist, копает глубже Spotify",
                        speechStyle = "увлечённый, открывает скрытое в знакомом",
                        eraHint = "интернет, но душа всё ещё ищет настоящее",
                    )
            }
        }

        fun pickAngle(previousCount: Int): StoryAngle {
            return StoryAngle.entries[previousCount % StoryAngle.entries.size]
        }

        private fun guessDecadeYear(artist: String): Int {
            return 1955 + (artist.hashCode().and(0x7FFFFFFF) % 40)
        }
    }
}
