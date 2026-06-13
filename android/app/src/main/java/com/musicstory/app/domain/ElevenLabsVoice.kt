package com.musicstory.app.domain

enum class ElevenLabsVoice(
    val id: String,
    val labelRu: String,
    val labelEn: String,
    val descriptionRu: String,
    val descriptionEn: String,
) {
    AUTO("auto", "Авто", "Auto", "Голос подбирается по амплуа", "Matched to narrator persona"),
    RACHEL("rachel", "Рейчел", "Rachel", "Спокойный женский", "Calm, clear female"),
    ADAM("adam", "Адам", "Adam", "Глубокий мужской", "Deep, confident male"),
    ANTONI("antoni", "Антони", "Antoni", "Тёплый мужской", "Warm, rounded male"),
    BELLA("bella", "Белла", "Bella", "Мягкий женский", "Soft, gentle female"),
    ELLI("elli", "Элли", "Elli", "Молодой женский", "Young, upbeat female"),
    JOSH("josh", "Джош", "Josh", "Чёткий повествователь", "Crisp narrative male"),
    SAM("sam", "Сэм", "Sam", "Хриплый мужской", "Raspy, characterful male"),
    EMILY("emily", "Эмили", "Emily", "Спокойная зрелая", "Calm, mature female"),
    CHARLIE("charlie", "Чарли", "Charlie", "Разговорный мужской", "Casual conversational male"),
    MATILDA("matilda", "Матильда", "Matilda", "Выразительная женский", "Expressive, warm female"),
    ;

    fun label(resolved: ResolvedAppLanguage): String =
        if (resolved == ResolvedAppLanguage.EN) labelEn else labelRu

    fun description(resolved: ResolvedAppLanguage): String =
        if (resolved == ResolvedAppLanguage.EN) descriptionEn else descriptionRu

    companion object {
        fun fromId(id: String?): ElevenLabsVoice =
            entries.firstOrNull { it.id == id?.trim() } ?: AUTO
    }
}
