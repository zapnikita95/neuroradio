package com.musicstory.app.domain

/**
 * Stress hints for Android TTS: dictionary uses Yandex-style + before the vowel,
 * converted to Unicode combining acute. Only tricky studio/music words — not common vocabulary.
 */
object RussianStress {

    private val stressByWord = mapOf(
        "атлас" to "атл+ас",
        "атласе" to "атл+асе",
        "барабан" to "бараб+ан",
        "батарея" to "батар+ея",
        "версии" to "верс+ии",
        "версию" to "верс+ию",
        "дубль" to "д+убль",
        "инженер" to "инжен+ер",
        "инженера" to "инжен+ера",
        "инженером" to "инжен+ером",
        "инженеры" to "инжен+еры",
        "звукорежиссёр" to "звукорежисс+ёр",
        "звукорежиссёра" to "звукорежисс+ёра",
        "звукорежиссёры" to "звукорежисс+ёры",
        "монитор" to "монит+ор",
        "монитора" to "монит+ора",
        "мониторами" to "монит+орами",
        "мониторах" to "монит+орах",
        "мониторов" to "монит+оров",
        "мониторы" to "монит+оры",
        "микрофон" to "микроф+он",
        "микрофона" to "микроф+она",
        "микрофоном" to "микроф+оном",
        "колонках" to "кол+онках",
        "колонки" to "кол+онки",
        "концерт" to "конц+ерт",
        "концерта" to "конц+ерта",
        "концерте" to "конц+ерте",
        "продюсер" to "прод+юсер",
        "продюсеры" to "прод+юсеры",
        "радиола" to "ради+ола",
        "радиолы" to "ради+олы",
        "раздевалке" to "раздев+алке",
        "свист" to "св+ист",
        "свиста" to "св+иста",
        "сингл" to "с+ингл",
        "сингла" to "с+ингла",
        "студии" to "ст+удии",
        "студию" to "ст+удию",
        "студия" to "ст+удия",
        "краснели" to "красн+ели",
        "эфир" to "эф+ир",
        "эфире" to "эф+ире",
    )

    fun apply(text: String): String {
        val normalized = RussianYo.apply(text)
        return normalized.replace(Regex("[а-яёА-ЯЁ][а-яёА-ЯЁ+-]*")) { match ->
            applyToWord(match.value)
        }
    }

    private fun applyToWord(word: String): String {
        val bare = word.replace("+", "")
        val marked = stressByWord[bare.lowercase()] ?: return bare
        return markedToUnicode(marked, preserveCase = word.first().isUpperCase())
    }

    private fun markedToUnicode(marked: String, preserveCase: Boolean): String {
        val plusIndex = marked.indexOf('+')
        if (plusIndex < 0) return marked
        val stressedVowel = marked[plusIndex + 1]
        val result = buildString {
            append(marked.substring(0, plusIndex))
            append(stressedVowel)
            append('\u0301')
            append(marked.substring(plusIndex + 2))
        }
        return if (preserveCase) {
            result.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        } else {
            result
        }
    }
}
