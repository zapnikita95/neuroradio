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
        val eraYear = year ?: guessYear(cleanArtist, cleanTitle, genre)
        val angle = StoryAngle.entries[angleIndex % StoryAngle.entries.size]

        var script = buildScript(cleanArtist, cleanTitle, eraYear, genre, persona, angle)
        var attempt = 0
        while (attempt < StoryAngle.entries.size && isTooSimilar(script, previousScripts)) {
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
            ttsHint = "Локальная история — озвучка через Android TTS",
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
        val hook = persona.openingPhrase()
        val custom = artistFact(artist, title, year)
        if (custom != null) {
            return "$hook $custom"
        }

        val genreNote = genre?.let { " В жанре $it это особенно заметно." }.orEmpty()
        return when (angle) {
            StoryAngle.RECORDING_SECRET ->
                "$hook В $year году при записи «$title» ${persona.shortRole()} " +
                    "настояли оставить дубль с ошибкой — тот самый срыв голоса на секунде стал фирменным моментом.$genreNote"

            StoryAngle.CULTURE_CONTEXT ->
                "$hook $year-й: ${persona.eraHint}. «$title» от $artist попал ровно в этот момент — " +
                    "не фон, а газета улицы, которую включают громче разговора."

            StoryAngle.ARTIST_OBSESSION ->
                "$hook Я собираю всё на $artist — bootleg’и, интервью, обложки. «$title» ($year) " +
                    "каждый раз даёт новую деталь: ${persona.obsessionDetail()}."

            StoryAngle.LIVE_MOMENT ->
                "$hook На живом show $year года $artist вышел с «$title» — зал замолчал на первой ноте, " +
                    "потом взорвался так, что монitors у engineers краснели."

            StoryAngle.HIDDEN_MEANING ->
                "$hook «$title» звучит просто, но ${persona.shortRole()} слышит второй слой: " +
                    "настроение $year-го, которое в чартах редко называют вслух."

            StoryAngle.SCENE_GOSSIP ->
                "$hook На сцене $year-го шептались: $artist и «$title» — не просто хит, а спор в кулуарах. " +
                    "${persona.sceneGossip()}."
        }
    }

    private fun artistFact(artist: String, title: String, year: Int): String? {
        val a = artist.lowercase()
        val t = title.lowercase()
        return when {
            a.contains("elvis") && (t.contains("jxl") || t.contains("little less")) ->
                "В 2002 JXL вытащил из архива RCA дemo 1968 года, наложил breakbeat — " +
                    "и Elvis снова в чартах через четверть века. Без этого ремикса многие бы не узнали оригинал."

            a.contains("elvis") ->
                "Elvis в $year-м ломал формат: телевизионные камеры ловили не только голос, " +
                    "но и реакцию зала — «$title» записывали как шоу, не как сессию."

            a.contains("beatles") ->
                "На «$title» ($year) Beatles экспериментировали со слоями — соседи в Abbey Road " +
                    "жаловались на громкость, а инженеры прятали новые эффекты от лейбла."

            a.contains("miles davis") ->
                "Miles в $year-м менял правила: «$title» — не мелодия, а настроение. " +
                    "Музыканты в студии не всегда знали, что играют, пока не услышали монитор."

            else -> null
        }
    }

    private fun guessYear(artist: String, title: String, genre: String?): Int {
        val t = title.lowercase()
        if (t.contains("jxl") || t.contains("remix")) return 2002
        genre?.lowercase()?.let { g ->
            if (g.contains("jazz")) return 1958
        }
        return 1965 + (artist.hashCode().and(0x7FFFFFFF) % 35)
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

private fun StoryPersona.openingPhrase(): String = when {
    speechStyle.contains("джаз", ignoreCase = true) -> "Знаешь,"
    speechStyle.contains("блюз", ignoreCase = true) -> "Слушай,"
    speechStyle.contains("рок", ignoreCase = true) -> "Вот что,"
    speechStyle.contains("клуб", ignoreCase = true) || speechStyle.contains("неон", ignoreCase = true) -> "Смотри,"
    speechStyle.contains("хип", ignoreCase = true) -> "Факт,"
    yearHint() >= 2000 -> "Короче,"
    yearHint() >= 1980 -> "Слушай сюда,"
    else -> "Знаешь,"
}

private fun StoryPersona.shortRole(): String = roleTitle.substringBefore(',').trim()

private fun StoryPersona.obsessionDetail(): String = when {
    speechStyle.contains("винил", ignoreCase = true) -> "на B-side другой take"
    speechStyle.contains("кассет", ignoreCase = true) -> "на старой кассете другой fade-out"
    else -> "в live-версии другая фраза"
}

private fun StoryPersona.sceneGossip(): String = when {
    eraHint.contains("MTV", ignoreCase = true) -> "Кто-то спорил, что клип важнее пластинки"
    eraHint.contains("радио", ignoreCase = true) -> "Диджеи делили эфир — кому первому крутить"
    else -> "Продюсеры спорили, пускать ли такой сингл"
}

private fun StoryPersona.yearHint(): Int {
    val match = Regex("(\\d{4})").find(roleTitle) ?: Regex("(\\d{4})").find(eraHint)
    return match?.groupValues?.get(1)?.toIntOrNull() ?: 1970
}
