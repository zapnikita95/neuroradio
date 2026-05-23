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
        artistFact(artist, title, year)?.let { return it }

        val genreNote = genre?.let { " В жанре $it это особенно заметно." }.orEmpty()
        return when (angle) {
            StoryAngle.RECORDING_SCENE ->
                "Помню $year-й, студия — при записи «$title» ${persona.shortRole()} " +
                    "настояли оставить дубль с ошибкой. Тот срыв голоса на секунде стал фирменным моментом, " +
                    "инженер потом говорил, что микрофон еле остыл.$genreNote"

            StoryAngle.FIRST_HEAR ->
                "Тогда я стоял у радиолы в $year-м — «$title» от $artist вылетел как удар. " +
                    "Соседи стучали по батарее, а мы не могли выключить, потому что ${persona.eraHint} " +
                    "и эта песня попала ровно в этот момент."

            StoryAngle.LIVE_MOMENT ->
                "На живом show $year года $artist вышел с «$title» — зал замолчал на первой ноте. " +
                    "Я стоял у мониторов, engineers краснели от feedback, а потом зал взорвался так, " +
                    "что cape routine казался малым делом."

            StoryAngle.BACKSTAGE ->
                "В $year-м за кулисами шептались: $artist и «$title» — не просто сингл. " +
                    "Продюсеры спорили до утра, кто первым пустит такой звук в эфир, " +
                    "а ${persona.shortRole()} уже знал — это изменит сезон."

            StoryAngle.FAN_DETAIL ->
                "Я собираю всё на $artist — bootleg'и, интервью, обложки. «$title» ($year) " +
                    "каждый раз даёт новую деталь: в live-версии другая фраза, на B-side другой take. " +
                    "Фанаты замечают это не с первого раза."

            StoryAngle.SCENE_GOSSIP ->
                "В $year-м на сцене шептались: $artist и «$title» — спор в кулуарах, не просто хит. " +
                    "${persona.sceneGossip()}. Я был там — помню запах дыма и то, как зал не дышал."
        }
    }

    private fun artistFact(artist: String, title: String, year: Int): String? {
        val a = artist.lowercase()
        val t = title.lowercase()
        return when {
            a.contains("james brown") && t.contains("i got you") ->
                "Помню '65-й, Apollo — Brown ещё в раздевалке делал splits, а мы уже не дышали. " +
                    "I Got You сняли за один take, инженер говорил — микрофон еле остыл. " +
                    "Я кричал так, что на следующий день не мог говорить, а сосед по ряду потерял голос раньше меня."

            a.contains("james brown") ->
                "That night в Apollo $year-го Brown вышел в cape — сбросил, надел, сбросил снова. " +
                    "«$title» — не просто песня, это ритуал. Мы знали каждый scream, каждый drop на колено. " +
                    "Harlem не спал после таких шоу."

            a.contains("elvis") && (t.contains("jxl") || t.contains("little less")) ->
                "Помню, как в 2002 JXL вытащил из архива RCA demo 1968 года — оригинал «A Little Less Conversation» " +
                    "лежал мёртвым, пока breakbeat не вернул King в чарты. Я слушал обе версии подряд: " +
                    "в 68-м Elvis пел для TV Special, а через тридцать лет трек снова качал клубы."

            a.contains("elvis") ->
                "Тогда, в $year-м, Elvis ломал формат — «$title» записывали как шоу для TV, не как сессию. " +
                    "Камеры ловили не только голос, но и реакцию зала. King знал: зрители важнее чартов."

            a.contains("beatles") ->
                "В Abbey Road, $year-й — на «$title» Beatles наслаивали дорожки, соседи жаловались на громкость. " +
                    "Инженеры прятали новые эффекты от лейбла, а мы уже знали — это не просто сингл, это сдвиг."

            a.contains("miles davis") ->
                "Miles в $year-м менял правила в студии — «$title» не мелодия, а настроение. " +
                    "Музыканты не всегда знали, что играют, пока не услышали монитор. " +
                    "Я стоял за стеклом и не понимал, куда это ведёт — потом понял."

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

private fun StoryPersona.shortRole(): String = roleTitle.substringBefore(',').trim()

private fun StoryPersona.sceneGossip(): String = when {
    eraHint.contains("MTV", ignoreCase = true) -> "Кто-то спорил, что клип важнее пластинки"
    eraHint.contains("радио", ignoreCase = true) -> "Диджеи делили эфир — кому первому крутить"
    else -> "Продюсеры спорили, пускать ли такой сингл"
}
