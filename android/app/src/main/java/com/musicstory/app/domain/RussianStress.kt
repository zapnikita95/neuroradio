package com.musicstory.app.domain

/**
 * Stress hints for Android TTS: dictionary uses Yandex-style + before the vowel,
 * converted to Unicode combining acute for better pronunciation on device voices.
 */
object RussianStress {

    private val stressByWord = mapOf(
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
        "концерте" to "конц+ерте",
        "концерта" to "конц+ерта",
        "краснели" to "красн+ели",
        "свиста" to "св+иста",
        "свист" to "св+ист",
    )

    fun apply(text: String): String {
        return text.replace(Regex("[а-яёА-ЯЁ][а-яёА-ЯЁ+-]*")) { match ->
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
