package com.musicstory.app.domain

import com.musicstory.app.data.model.StoryResponse

object LocalStoryGenerator {

    fun generate(
        artist: String,
        title: String,
        year: Int? = null,
        genre: String? = null,
        previousScripts: List<String> = emptyList(),
        angleIndex: Int = 0,
    ): StoryResponse {
        val cleanArtist = artist.trim()
        val cleanTitle = title.trim()
        val persona = StoryPersona.forTrack(year, genre, cleanArtist)
        val eraYear = year ?: when {
            genre?.contains("jazz", ignoreCase = true) == true -> 1958
            else -> 1975 + (cleanArtist.hashCode().and(0x7FFFFFFF) % 25)
        }
        val angle = StoryAngle.entries[angleIndex % StoryAngle.entries.size]

        var script = buildScript(cleanArtist, cleanTitle, eraYear, genre, persona, angle)
        var attempt = 0
        while (attempt < 5 && isTooSimilar(script, previousScripts)) {
            attempt++
            val altAngle = StoryAngle.entries[(angleIndex + attempt) % StoryAngle.entries.size]
            script = buildScript(cleanArtist, cleanTitle, eraYear, genre, persona, altAngle)
        }

        return StoryResponse(
            artist = cleanArtist,
            title = cleanTitle,
            year = eraYear,
            genre = genre?.trim()?.takeIf { it.isNotEmpty() },
            script = script,
            wordCount = countWords(script),
            demo = true,
            audioUrl = null,
            ttsHint = "Локальная история — Android TTS",
        )
    }

    private fun buildScript(
        artist: String,
        title: String,
        year: Int,
        genre: String?,
        persona: StoryPersona,
        angle: StoryAngle,
    ): String {
        val genreBit = genre?.let { " — $it в крови," } ?: ","
        return when (angle) {
            StoryAngle.RECORDING_SECRET ->
                "Слушай, братуха… «$title» от $artist$genreBit это $year-й, и тут есть секрет: " +
                    "на записи слышно не только ноты — слышно, как ${persona.roleTitle.split(',').first()} " +
                    "вкладывает душу, будто завтра конец света. Микрофон ловит вздох между тактами — " +
                    "и вот этот вздох стоит слушать снова. Врубай громче, не пожалеешь."

            StoryAngle.CULTURE_CONTEXT ->
                "О-о-о, $year год… «$title», $artist. Представь: ${persona.eraHint}. " +
                    "Люди ещё не листают ленту — они живут в моменте, и эта пластинка " +
                    "как газета того дня: в ней пульс улицы, страх, надежда и дерзость. " +
                    "Слушай не фоном — слушай как современник."

            StoryAngle.ARTIST_OBSESSION ->
                "Братуха, я фанат $artist с тех пор, как впервые услышал «$title». " +
                    "Это $year, ${persona.speechStyle.take(60)}… " +
                    "Каждый раз, когда включаю этот трек, ловлю новую деталь — " +
                    "фразу, паузу, огонь. Вот ради таких моментов и копаешь музыку до дна."

            StoryAngle.LIVE_MOMENT ->
                "Чувак, «$title» — это не студийная картинка, это зал $year года. " +
                    "$artist выходит — и воздух меняется. Публика замирает, потом взрывается. " +
                    "Даже на записи чувствуешь, как пол под ногами дрожит. " +
                    "Закрой глаза — ты в первом ряду."

            StoryAngle.HIDDEN_MEANING ->
                "Слушай внимательно: «$title» от $artist — $year. " +
                    "С первого раза кажется простым, а на самом деле там второй слой — " +
                    "настроение эпохи, которое ${persona.roleTitle} понимает без слов. " +
                    "Музыка говорит то, что люди боялись сказать вслух. Вот почему она цепляет."

            StoryAngle.SCENE_GOSSIP ->
                "Братуха, на сцене $year года шептались: $artist с «$title» — " +
                    "это не просто хит, это разговор всей тусовки. ${persona.eraHint}. " +
                    "Кто-то спорил до драки, кто-то плакал в туалете от красоты. " +
                    "А мы просто включаем — и снова там, где всё начиналось."
        }
    }

    private fun isTooSimilar(candidate: String, previous: List<String>): Boolean {
        val c = candidate.lowercase()
        return previous.any { prev ->
            val p = prev.lowercase()
            p == c || p.take(80) == c.take(80)
        }
    }

    private fun countWords(text: String): Int =
        text.trim().split(Regex("\\s+")).count { it.isNotEmpty() }
}
