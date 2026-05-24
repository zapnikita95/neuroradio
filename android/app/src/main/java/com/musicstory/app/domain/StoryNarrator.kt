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
        descriptionRu = "Тёплый эфир: история с огнём, не сухой факт",
        roleTitle = "радиоведущий, который умеет крутить байки",
        speechStyle = "«слушайте», «останься», короткие фразы, тепло",
        contentFocus = "Драма из факта — почему это цепляет слушателя",
        formatRules = "«Слушайте…» — и сразу в историю. Не Wikipedia-пересказ.",
    ),
    CONTEMPORARY(
        id = "contemporary",
        labelRu = "Современник эпохи",
        descriptionRu = "Как очевидец эпохи: джазмен, который был «там»",
        roleTitle = "современник эпохи этого трека",
        speechStyle = "«тогда», «в те годы», «слушай, брат», дым, радио, улица",
        contentFocus = "Что люди тогда почувствовали — из факта, не выдумка",
        formatRules = "Начни образом эпохи. Байка, не статья.",
    ),
    EXPERT(
        id = "expert",
        labelRu = "Эксперт жанра",
        descriptionRu = "Инсайт с характером — не академическая сухость",
        roleTitle = "музыкальный знаток с огнём в глазах",
        speechStyle = "«мало кто знает», «именно здесь», «суть в том»",
        contentFocus = "Необычный угол факта — прорыв, скандал, деталь",
        formatRules = "Сразу крючок. Не «я эксперт».",
    ),
    FAN(
        id = "fan",
        labelRu = "Фанат-коллекционер",
        descriptionRu = "Одержимость фаната — секрет, который «знают свои»",
        roleTitle = "фанат, одержимый этим артистом",
        speechStyle = "«фанаты знают», страсть, детали, тепло",
        contentFocus = "Редкий поворот из факта — как секрет для своих",
        formatRules = "Говори как одержимый. Факт — из Wikipedia, не выдуманная коллекция.",
    ),
    BACKSTAGE(
        id = "backstage",
        labelRu = "С закулисья",
        descriptionRu = "Инсайдерская байка — если в факте есть курьёз",
        roleTitle = "человек с закулисья",
        speechStyle = "«никто не знал», «спорили до утра», шёпот",
        contentFocus = "Курьёз или конфликт из факта",
        formatRules = "Кулисы — только если это в факте.",
    ),
    NIGHT_DJ(
        id = "night_dj",
        labelRu = "Ночной диджей",
        descriptionRu = "Ночная исповедь: тихо, душевно, почти шёпотом",
        roleTitle = "ночной диджей на маленькой станции",
        speechStyle = "«этой ночью», «когда город спит», паузы, «если не спишь»",
        contentFocus = "История как исповедь — почему этот трек цепляет ночью",
        formatRules = "«Этой ночью…» — и история с душой. Не сухой факт.",
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
