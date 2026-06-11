package com.musicstory.app.domain

enum class TtsVoice(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val yandexId: String? = null,
    val supportsEvil: Boolean = false,
) {
    AUTO("auto", "Авто", "Голос подбирается по эпохе и жанру трека"),
    ALENA("alena", "Алёна", "женский, мягкий и дружелюбный", "alena"),
    FILIPP("filipp", "Филипп", "мужской, ровный и приятный", "filipp"),
    ERMIL("ermil", "Ермил", "мужской, нейтральный и спокойный", "ermil"),
    JANE("jane", "Джейн", "женский, строгий и чёткий", "jane", supportsEvil = true),
    OMAZH("omazh", "Омаж", "женский, строгий и драматичный", "omazh", supportsEvil = true),
    ZAHAR("zahar", "Захар", "мужской, строгий и уверенный", "zahar", supportsEvil = true),
    MARINA("marina", "Марина", "женский, тёплый и мягкий", "marina"),
    DASHA("dasha", "Даша", "женский, живой и современный", "dasha"),
    JULIA("julia", "Юлия", "женский, строгий и собранный", "julia", supportsEvil = true),
    KIRILL("kirill", "Кирилл", "мужской, строгий и деловой", "kirill", supportsEvil = true),
    MASHA("masha", "Маша", "женский, дружелюбный и лёгкий", "masha"),
    ALEXANDER("alexander", "Александр", "мужской, нейтральный и универсальный", "alexander"),
    LERA("lera", "Лера", "женский, молодой и живой", "lera"),
    ;

    val isAuto: Boolean get() = this == AUTO

    companion object {
        fun fromId(id: String?): TtsVoice =
            if (id.isNullOrBlank()) ZAHAR
            else entries.firstOrNull { it.id == id } ?: ZAHAR
    }
}
