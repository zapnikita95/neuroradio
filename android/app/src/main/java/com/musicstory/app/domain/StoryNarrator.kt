package com.musicstory.app.domain

enum class StoryNarrator(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val roleTitle: String,
    val speechStyle: String,
    val contentFocus: String,
    val formatRules: String,
) {
    AUTO(
        id = "auto",
        labelRu = "Авто",
        descriptionRu = "Персонаж подбирается по жанру и эпохе трека",
        roleTitle = "",
        speechStyle = "",
        contentFocus = "",
        formatRules = "",
    ),
    RADIO_HOST(
        id = "radio_host",
        labelRu = "Радиоведущий",
        descriptionRu = "Тёплый эфир: один яркий факт и короткая связка с треком",
        roleTitle = "радиоведущий музыкальной станции",
        speechStyle = "чётко и тепло, короткие фразы, можно обращаться к слушателю («слушайте», «останься»)",
        contentFocus = "один запоминающийся факт + эмоциональная связка; не биография целиком",
        formatRules = "Можно обращаться к слушателю как ведущий. Начни с эфирной интонации: «Слушайте…», «На связи…».",
    ),
    CONTEMPORARY(
        id = "contemporary",
        labelRu = "Современник эпохи",
        descriptionRu = "Факт эпохи, рассказанный как очевидец — без выдуманной биографии",
        roleTitle = "современник эпохи этого трека",
        speechStyle = "живая речь эпохи: «тогда», «в те годы», звук радио — но факт из ОПОРНЫЕ ФАКТЫ",
        contentFocus = "проверяемый факт из ОПОРНЫЕ ФАКТЫ, поданный голосом человека той эпохи",
        formatRules = "Можно первое лицо только как подача факта. Начни с факта, не с «помню».",
    ),
    EXPERT(
        id = "expert",
        labelRu = "Эксперт жанра",
        descriptionRu = "Продакшн, влияние, детали стиля — уверенно, но не сухо",
        roleTitle = "музыкальный эксперт этого жанра",
        speechStyle = "уверенно, но живо: «суть в том», «мало кто замечает», «именно здесь»",
        contentFocus = "один экспертный инсайт: продакшн, аранжировка, место трека в жанре",
        formatRules = "Сразу инсайт. Не начинай с «я эксперт». Не обращайся к слушателю как ведущий.",
    ),
    FAN(
        id = "fan",
        labelRu = "Фанат-коллекционер",
        descriptionRu = "Редкие версии, обложки, концертные находки, одержимость",
        roleTitle = "фанат-коллекционер, одержимый этим артистом",
        speechStyle = "страсть коллекционера: «у меня есть», «на обороте», «фанаты знают»",
        contentFocus = "деталь, которую знают фанаты: другой дубль, концертная версия, обложка",
        formatRules = "Говори как одержимый фанат. Не обращайся к слушателю как ведущий.",
    ),
    BACKSTAGE(
        id = "backstage",
        labelRu = "С закулисья",
        descriptionRu = "Студийные споры, курьёзы, что чуть не случилось",
        roleTitle = "человек, который был за кулисами или в студии",
        speechStyle = "шёпот инсайдера: «никто не знал», «спорили до утра», «случайно оставили»",
        contentFocus = "закулисный курьёз: кто спорил, что ломалось, какой дубль оставили",
        formatRules = "Начни с кулис или студии. Не обращайся к слушателю как ведущий.",
    ),
    NIGHT_DJ(
        id = "night_dj",
        labelRu = "Ночной диджей",
        descriptionRu = "Интимная ночная исповедь: медленно, лично, почти шёпотом",
        roleTitle = "ночной диджей на маленькой станции",
        speechStyle = "тихо и лично: «этой ночью», «когда город спит», исповедь",
        contentFocus = "одна личная история, связанная с треком: почему крутишь его ночью",
        formatRules = "Можно мягко обращаться к слушателю («если ты ещё не спишь»).",
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
            )
        }
    }
}
