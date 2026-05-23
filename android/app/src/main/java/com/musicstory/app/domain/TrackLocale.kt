package com.musicstory.app.domain

data class TrackLocale(
    val countryCode: String?,
    val countryLabelRu: String,
    val sceneHintRu: String,
    val yearLabelRu: String,
    val localeRulesRu: String,
)

object TrackLocaleResolver {

    private val cyrillicRegex = Regex("[\\u0400-\\u04FF]")

    private val countryLabels = mapOf(
        "RU" to "Россия",
        "UA" to "Украина",
        "BY" to "Беларусь",
        "KZ" to "Казахстан",
        "US" to "США",
        "GB" to "Великобритания",
    )

    fun inferCountryFromText(artist: String, title: String): String? {
        if (cyrillicRegex.containsMatchIn(artist) || cyrillicRegex.containsMatchIn(title)) return "RU"
        return null
    }

    fun resolve(
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        countryCode: String? = null,
    ): TrackLocale {
        val code = countryCode?.uppercase()?.takeIf { it.length == 2 }
            ?: inferCountryFromText(artist, title)
        val countryLabel = code?.let { countryLabels[it] ?: it } ?: "неизвестна"
        val sceneHint = sceneForCountry(code, year, genre, title, artist) ?: genericEraFallback(year, genre)
        val yearLabel = year?.toString()
            ?: if (code == "RU") {
                "неизвестен — ориентируйся на современную российскую сцену, не на СССР и не на американское радио"
            } else {
                "неизвестен — не выдумывай винтаж (радиола, Apollo), если трек звучит современно"
            }
        val localeRules = when (code) {
            "RU" -> "Трек из России: места, быт, сленг и индустрия — российские. Не Nashville, не Apollo, не «радиола» для современного российского трека."
            null -> "Страна неизвестна — не приписывай конкретную американскую или советскую эпоху без оснований."
            else -> "Трек связан со страной $countryLabel: история должна быть из этой культурной сцены."
        }
        return TrackLocale(
            countryCode = code,
            countryLabelRu = countryLabel,
            sceneHintRu = sceneHint,
            yearLabelRu = yearLabel,
            localeRulesRu = localeRules,
        )
    }

    fun eraContextForPrompt(
        year: Int?,
        genre: String?,
        countryCode: String? = null,
        artist: String = "",
        title: String = "",
    ): String = sceneForCountry(countryCode, year, genre, title, artist) ?: genericEraFallback(year, genre)

    private fun genericEraFallback(year: Int?, genre: String?): String {
        val g = genre?.lowercase().orEmpty()
        if (g.contains("jazz") || g.contains("swing")) return "джазовая эпоха, клубы и джем-сейшены"
        if (g.contains("blues") || g.contains("soul")) return "soul и blues, южные клубы и ночные сцены"
        if (g.contains("rock") || g.contains("metal") || g.contains("punk")) return "рок-сцена, концерты и гаражи"
        if (g.contains("electronic") || g.contains("house") || g.contains("techno") || g.contains("dance")) {
            return "клубная электроника, склады и диджейские стыки"
        }
        if (g.contains("hip hop") || g.contains("rap")) return "хип-хоп с блока, уличные вечеринки"
        if (g.contains("pop")) return "поп-культура, радио и телевидение"
        if (year == null) return "эпоха артиста — без винтажных клише, если трек современный"
        if (year < 1960) return "ранний период, винил и живое радио"
        if (year < 1970) return "расцвет soul и rock"
        if (year < 1980) return "золотая эра рока и диско"
        if (year < 1990) return "MTV, кассеты и фестивали"
        if (year < 2000) return "клубы и ремиксы"
        if (year < 2010) return "интернет-форумы и первые стримы"
        return "современная сцена, стриминги и соцсети"
    }

    private fun isRussianCountryGenre(genre: String?, title: String, artist: String): Boolean {
        val g = genre?.lowercase().orEmpty()
        val text = "$title $artist".lowercase()
        return (g.contains("country") || text.contains("кантри")) &&
            (cyrillicRegex.containsMatchIn(artist) || cyrillicRegex.containsMatchIn(title))
    }

    private fun sceneForCountry(
        countryCode: String?,
        year: Int?,
        genre: String?,
        title: String,
        artist: String,
    ): String? {
        val code = countryCode?.uppercase() ?: inferCountryFromText(artist, title) ?: return null
        val g = genre?.lowercase().orEmpty()
        val modern = year == null || year >= 2010

        if (code != "RU") return null

        if (isRussianCountryGenre(genre, title, artist)) {
            return if (modern) {
                "российский кантри/рэп, студии и стриминги, не Nashville и не американская радиола"
            } else {
                "российская кантри-сцена, свои артисты и площадки"
            }
        }
        if (g.contains("hip hop") || g.contains("rap") || g.contains("trap")) {
            return if (modern) "российский рэп/трэп, студии, VK, Telegram, фестивали"
            else "российская рэп-сцена, свои лейблы и площадки"
        }
        if (g.contains("rock") || g.contains("punk") || g.contains("metal")) {
            return if (modern) "российская рок-сцена, клубы и фестивали"
            else "российский рок, свои площадки и студии"
        }
        if (g.contains("pop")) {
            return if (modern) "российская pop-сцена, стриминги и соцсети"
            else "российская эстрада и pop"
        }
        return if (modern) {
            "современная российская музыка: стриминги, VK, Telegram, студии, фестивали"
        } else if (year != null && year >= 2000) {
            "российская сцена нулевых: MTV Russia, mp3, первые стримы"
        } else if (year != null && year >= 1990) {
            "российская сцена девяностых: кассеты, рок-клубы, первые частные студии"
        } else {
            "российская музыкальная сцена"
        }
    }
}
