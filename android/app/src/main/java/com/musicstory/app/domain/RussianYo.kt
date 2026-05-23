package com.musicstory.app.domain

/** Fix «е» → «ё» in words Yandex/Android TTS often misread. */
object RussianYo {

    private val yoByWord = mapOf(
        "еще" to "ещё",
        "ещё" to "ещё",
        "жесткий" to "жёсткий",
        "жесткая" to "жёсткая",
        "жесткое" to "жёсткое",
        "жесткие" to "жёсткие",
        "жестко" to "жёстко",
        "легкий" to "лёгкий",
        "легкая" to "лёгкая",
        "легкое" to "лёгкое",
        "легкие" to "лёгкие",
        "легко" to "лёгко",
        "счет" to "счёт",
        "счета" to "счёта",
        "счете" to "счёте",
        "счетом" to "счётом",
        "слез" to "слёз",
        "слезы" to "слёзы",
        "слезами" to "слёзами",
        "звезд" to "звёзд",
        "звезды" to "звёзды",
        "рев" to "рёв",
        "рева" to "рёва",
        "ревом" to "рёвом",
        "подъем" to "подъём",
        "подъема" to "подъёма",
        "подъемом" to "подъёмом",
        "объем" to "объём",
        "объема" to "объёма",
        "объемом" to "объёмом",
        "мед" to "мёд",
        "меда" to "мёда",
        "медом" to "мёдом",
        "лед" to "лёд",
    )

    fun apply(text: String): String {
        return text.replace(Regex("[а-яёА-ЯЁ]+")) { match ->
            val word = match.value
            val fixed = yoByWord[word.lowercase()] ?: return@replace word
            if (word.first().isUpperCase()) {
                fixed.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            } else {
                fixed
            }
        }
    }
}
