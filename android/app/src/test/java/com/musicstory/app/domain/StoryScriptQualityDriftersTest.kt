package com.musicstory.app.domain

import org.junit.Assert.assertTrue
import org.junit.Test

class StoryScriptQualityDriftersTest {

  private val driftersHallucination =
      """
      The Drifters – группа, которая сломала правила. Во-первых, их запись была необычной –
      они использовали двойную сессию. Итак, в студии они записали песню, а затем в другую ночь
      вложили сотни дублей. Но что было еще более удивительным, так это то, что их песня была
      запрещена на радио, потому что ее считали слишком политически неправильной.
      """.trimIndent()

  @Test
  fun rejectsDriftersPoliticalBanWithoutSeed() {
    assertTrue(
        StoryScriptQuality.isTemplateLike(
            driftersHallucination,
            artist = "The Drifters",
            title = "Up on the Roof",
            referenceFacts = listOf(
                "The Drifters are an American vocal group formed in 1953.",
            ),
            strictReferenceAnchor = true,
        ),
    )
  }
}
