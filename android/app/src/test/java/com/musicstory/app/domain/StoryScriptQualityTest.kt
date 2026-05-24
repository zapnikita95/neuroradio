package com.musicstory.app.domain

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StoryScriptQualityTest {

    private val badScript =
        "Я помогаюсь в создании музыки, как это происходит на студии. Артист, Брэд Салливан, и его команда работают вместе, чтобы создать этот трек «Rock & Roll Queen». Они сосредоточены на деталях, от выбора инструмента до постановки вокала."

    @Test
    fun rejectsSubwaysStudioFiction() {
        assertTrue(StoryScriptQuality.hasBannedPattern(badScript))
        assertTrue(StoryScriptQuality.hasFictionPattern(badScript))
        assertTrue(
            StoryScriptQuality.isTemplateLike(
                badScript,
                artist = "The Subways",
                title = "Rock & Roll Queen",
                referenceFacts = listOf(
                    "Rock & Roll Queen is a song by English indie rock band The Subways.",
                ),
            ),
        )
    }

    @Test
    fun rejectsDryMediaListing() {
        val dry =
            "Сингл «Rock & Roll Queen» попал в саундтрек EA Sports и рекламу Rimmel — для инди-группы это был выход в мейнстрим."
        assertTrue(StoryScriptQuality.hasDryEncyclopediaTone(dry))
        assertTrue(
            StoryScriptQuality.isTemplateLike(
                dry,
                artist = "The Subways",
                title = "Rock & Roll Queen",
                referenceFacts = listOf(
                    "It also features in British TV advertisements for Rimmel and EA Sports games.",
                ),
            ),
        )
    }

    @Test
    fun rejectsEnglishLeakInRussianNarration() {
        val bad =
            "Слушай, брат: «Redbone» — первые Native American на Billboard, кто вломился в пятёрку."
        assertTrue(StoryRussianLanguage.hasEnglishLeak(bad, "Redbone", "Come and Get Your Love"))
        assertTrue(
            StoryScriptQuality.isTemplateLike(
                bad,
                artist = "Redbone",
                title = "Come and Get Your Love",
                referenceFacts = listOf(
                    "It made them the first Native American band to reach the top five on the US Billboard Hot 100.",
                ),
            ),
        )
    }

    @Test
    fun acceptsDramaticStoryFromFact() {
        val good =
            "Слушай, брат: «Redbone» — первая индейская группа, которая вломилась в пятёрку американского хит-парада. Для коренных музыкантов это был не сухой рекорд, а выход из тени — их услышали на всю страну."
        assertFalse(StoryRussianLanguage.hasEnglishLeak(good, "Redbone", "Come and Get Your Love"))
        assertFalse(StoryScriptQuality.hasFictionPattern(good))
        assertFalse(StoryScriptQuality.hasDryEncyclopediaTone(good))
        assertFalse(
            StoryScriptQuality.isTemplateLike(
                good,
                artist = "Redbone",
                title = "Come and Get Your Love",
                referenceFacts = listOf(
                    "It made them the first Native American band to reach the top five on the US Billboard Hot 100.",
                ),
            ),
        )
    }

    @Test
    fun acceptsConcreteStoryWithoutReferenceFacts() {
        val good =
            "«Lift Me Up» Moby записал как гимн после «Play» — в студии он наслаивал вокал, пока трек не стал звучать как молитва на танцполе."
        assertFalse(
            StoryScriptQuality.isTemplateLike(
                good,
                artist = "Moby",
                title = "Lift Me Up",
                referenceFacts = emptyList(),
            ),
        )
    }

    @Test
    fun rejectsWateryStoryWithoutReferenceFacts() {
        val watery = "Эта песня очень красивая и трогает душу каждого слушателя."
        assertTrue(
            StoryScriptQuality.isTemplateLike(
                watery,
                artist = "Moby",
                title = "Lift Me Up",
                referenceFacts = emptyList(),
            ),
        )
    }
}
