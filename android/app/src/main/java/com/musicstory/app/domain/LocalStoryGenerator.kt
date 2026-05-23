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
        storyNarrator: StoryNarrator = StoryNarrator.AUTO,
    ): StoryResponse {
        val cleanArtist = artist.trim()
        val cleanTitle = title.trim()
        val persona = StoryNarrator.buildPersona(storyNarrator, year, genre, cleanArtist)
        val angle = StoryAngle.entries[angleIndex % StoryAngle.entries.size]

        buildNarratorScript(cleanArtist, cleanTitle, storyNarrator)?.let { narratorScript ->
            if (!isTooSimilar(narratorScript, previousScripts)) {
                return response(cleanArtist, cleanTitle, year, genre, narratorScript)
            }
        }

        var script = buildScript(cleanArtist, cleanTitle, genre, persona, angle)
        var attempt = 0
        while (attempt < StoryAngle.entries.size && isTooSimilar(script, previousScripts)) {
            attempt++
            val altAngle = StoryAngle.entries[(angleIndex + attempt) % StoryAngle.entries.size]
            script = buildScript(cleanArtist, cleanTitle, genre, persona, altAngle)
        }

        return response(cleanArtist, cleanTitle, year, genre, script)
    }

    private fun response(
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        script: String,
    ): StoryResponse = StoryResponse(
        artist = artist,
        title = title,
        year = year,
        genre = genre?.trim()?.takeIf { it.isNotEmpty() },
        script = script,
        wordCount = countWords(script),
        demo = true,
        audioUrl = null,
        ttsHint = null,
    )

    private fun buildNarratorScript(
        artist: String,
        title: String,
        narrator: StoryNarrator,
    ): String? = when (narrator) {
        StoryNarrator.AUTO -> null
        StoryNarrator.RADIO_HOST ->
            "Слушайте — «$title» от $artist. Один дубль в студии, инженер потом говорил, что микрофон еле остыл. " +
                "Оставайтесь — дальше будет ещё интереснее."
        StoryNarrator.CONTEMPORARY ->
            "Помню ту ночь — «$title» вырвался из колонок, и я замер. Запах дыма, липкие ступени клуба, " +
                "соседи стучали по батарее. С того вечера эта песня у меня в голове навсегда."
        StoryNarrator.EXPERT ->
            "Суть «$title» — не в громкости, а в том, как $artist держит ритм на одном дыхании. " +
                "Мало кто замечает, как бас и ударные расходятся на полтона — именно здесь трек цепляет."
        StoryNarrator.FAN ->
            "У меня три версии «$title» — сингл, концертный дубль и оборот с другим аутро. " +
                "Фанаты $artist знают: в live-версии другая фраза перед финалом."
        StoryNarrator.BACKSTAGE ->
            "За кулисами спорили до утра — пускать ли «$title» таким, как записали. " +
                "$artist настоял на дубле с ошибкой. Продюсер потом признался: именно этот срыв и стал хитом."
        StoryNarrator.NIGHT_DJ ->
            "Если ты ещё не спишь — «$title» от $artist. Эту песню я кручу только после полуночи: " +
                "город тихий, а в наушниках — как исповедь."
    }

    private fun buildScript(
        artist: String,
        title: String,
        genre: String?,
        persona: StoryPersona,
        angle: StoryAngle,
    ): String {
        artistFact(artist, title)?.let { return it }

        val genreNote = genre?.let { " В жанре $it это особенно заметно." }.orEmpty()
        return when (angle) {
            StoryAngle.RECORDING_SCENE ->
                "Помню студию — при записи «$title» ${persona.shortRole()} " +
                    "настояли оставить дубль с ошибкой. Тот срыв голоса стал фирменным моментом, " +
                    "инженер потом говорил, что микрофон еле остыл.$genreNote"

            StoryAngle.FIRST_HEAR ->
                "Тогда я стоял у радиолы — «$title» от $artist вылетел как удар. " +
                    "Соседи стучали по батарее, а мы не могли выключить, потому что ${persona.eraHint.split(".").firstOrNull() ?: "это было то, что нужно"} " +
                    "и эта песня попала ровно в тот момент."

            StoryAngle.LIVE_MOMENT ->
                "На живом концерте $artist вышел с «$title» — зал замолчал на первой ноте. " +
                    "Я стоял у мониторов, звукорежиссёры краснели от свиста в колонках, а потом зал взорвался так, " +
                    "что па с плащом казался малым делом."

            StoryAngle.BACKSTAGE ->
                "За кулисами шептались: $artist и «$title» — не просто сингл. " +
                    "Продюсеры спорили до утра, кто первым пустит такой звук в эфир, " +
                    "а ${persona.shortRole()} уже знал — это изменит сезон."

            StoryAngle.FAN_DETAIL ->
                "Я собираю всё на $artist — концертные записи, интервью, обложки. «$title» " +
                    "каждый раз даёт новую деталь: в живой версии другая фраза, на обороте сингла другой дубль. " +
                    "Фанаты замечают это не с первого раза."

            StoryAngle.SCENE_GOSSIP ->
                "На сцене шептались: $artist и «$title» — спор в кулуарах, не просто хит. " +
                    "${persona.sceneGossip()}. Я был там — помню запах дыма и то, как зал не дышал."
        }
    }

    private fun artistFact(artist: String, title: String): String? {
        val a = artist.lowercase()
        val t = title.lowercase()
        return when {
            a.contains("james brown") && t.contains("i got you") ->
                "Помню Apollo — Brown ещё в раздевалке делал шпагаты, а мы уже не дышали. " +
                    "«I Got You» сняли за один дубль, инженер говорил — микрофон еле остыл. " +
                    "Я кричал так, что на следующий день не мог говорить."

            a.contains("james brown") ->
                "Той ночью в Apollo Brown вышел в плаще — сбросил, надел, сбросил снова. " +
                    "«$title» — не просто песня, это ритуал. Мы знали каждый крик, каждый удар колена. " +
                    "Гарлем не спал после таких концертов."

            a.contains("elvis") && (t.contains("jxl") || t.contains("little less")) ->
                "JXL вытащил из архива RCA старую запись — оригинал «A Little Less Conversation» " +
                    "лежал мёртвым, пока бит не вернул Elvis в чарты. Я слушал обе версии подряд."

            a.contains("elvis") ->
                "Elvis ломал формат — «$title» записывали как телешоу, не как студийную сессию. " +
                    "Камеры ловили не только голос, но и реакцию зала."

            a.contains("beatles") ->
                "На Abbey Road Beatles наслаивали дорожки на «$title», соседи жаловались на громкость. " +
                    "Инженеры прятали новые эффекты от лейбла, а мы уже знали — это не просто сингл."

            a.contains("miles davis") ->
                "Miles менял правила в студии — «$title» не мелодия, а настроение. " +
                    "Музыканты не всегда знали, что играют, пока не услышали монитор."

            else -> null
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

private fun StoryPersona.shortRole(): String = roleTitle.substringBefore(',').trim()

private fun StoryPersona.sceneGossip(): String = when {
    eraHint.contains("MTV", ignoreCase = true) -> "Кто-то спорил, что клип важнее пластинки"
    eraHint.contains("радио", ignoreCase = true) -> "Диджеи делили эфир — кому первому крутить"
    else -> "Продюсеры спорили, пускать ли такой сингл"
}
