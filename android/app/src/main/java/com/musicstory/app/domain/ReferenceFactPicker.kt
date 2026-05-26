package com.musicstory.app.domain



data class ReferenceFactBundle(

    val trackFacts: List<String> = emptyList(),

    val artistFacts: List<String> = emptyList(),

)



data class SelectedReferenceFact(

    val fact: String,

    val scope: FactScope,

    val scopeLabelRu: String,

)



enum class FactScope {

    TRACK,

    ARTIST,

}



object ReferenceFactPicker {



    fun pick(

        bundle: ReferenceFactBundle,

        previousScripts: List<String>,

        storyIndex: Int = previousScripts.size,

    ): SelectedReferenceFact? {

        val trackFacts = rankAndDedupe(bundle.trackFacts)

        val artistFacts = rankAndDedupe(bundle.artistFacts)

        val preferTrack = storyIndex % 2 == 0



        val primary = if (preferTrack) trackFacts else artistFacts

        val fallback = if (preferTrack) artistFacts else trackFacts

        val primaryScope = if (preferTrack) FactScope.TRACK else FactScope.ARTIST

        val fallbackScope = if (preferTrack) FactScope.ARTIST else FactScope.TRACK



        pickBackstoryFromPool(primary, previousScripts)?.let { fact ->
            return SelectedReferenceFact(fact, primaryScope, scopeLabel(primaryScope))
        }

        pickBackstoryFromPool(fallback, previousScripts)?.let { fact ->
            return SelectedReferenceFact(fact, fallbackScope, scopeLabel(fallbackScope))
        }

        pickFromPool(primary, previousScripts)?.let { fact ->
            return SelectedReferenceFact(fact, primaryScope, scopeLabel(primaryScope))
        }

        pickFromPool(fallback, previousScripts)?.let { fact ->
            return SelectedReferenceFact(fact, fallbackScope, scopeLabel(fallbackScope))
        }

        for (fact in (primary + fallback).distinct()) {
            if (ReferenceFactQuality.isBoringFact(fact)) continue
            if (!overlapsPrevious(fact, previousScripts)) {
                val scope = if (fact in primary) primaryScope else fallbackScope
                return SelectedReferenceFact(fact, scope, scopeLabel(scope))
            }
        }

        return null
    }



    fun factsForPrompt(selected: SelectedReferenceFact?): List<String> =

        selected?.let { listOf(it.fact) } ?: emptyList()



    private fun scopeLabel(scope: FactScope): String =

        if (scope == FactScope.TRACK) "трек" else "группа/артист"



    private fun rankAndDedupe(facts: List<String>): List<String> =

        ReferenceFactQuality.filterAndRank(facts)



    private fun pickFromPool(facts: List<String>, previousScripts: List<String>): String? {
        for (fact in facts) {
            if (ReferenceFactQuality.isBoringFact(fact)) continue
            if (ReferenceFactQuality.interestScore(fact) < ReferenceFactQuality.MIN_PICK_INTEREST_SCORE) continue
            if (!overlapsPrevious(fact, previousScripts)) return fact
        }
        for (fact in facts) {
            if (ReferenceFactQuality.isBoringFact(fact)) continue
            if (!overlapsPrevious(fact, previousScripts)) return fact
        }
        return null
    }

    private fun pickBackstoryFromPool(facts: List<String>, previousScripts: List<String>): String? {
        for (fact in facts) {
            if (!ReferenceFactQuality.isBackstoryFact(fact)) continue
            if (ReferenceFactQuality.isBoringFact(fact)) continue
            if (!overlapsPrevious(fact, previousScripts)) return fact
        }
        return null
    }



    private fun overlapsPrevious(fact: String, previousScripts: List<String>): Boolean {

        val factWords = significantWords(fact)

        if (factWords.isEmpty()) return false

        for (script in previousScripts) {

            val scriptWords = significantWords(script).toSet()

            val hits = factWords.count { it in scriptWords }

            val threshold = minOf(3, maxOf(2, kotlin.math.ceil(factWords.size * 0.45).toInt()))

            if (hits >= threshold) return true

        }

        return false

    }



    private fun normalize(text: String): String =

        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()



    private fun significantWords(text: String): List<String> =

        normalize(text).split(' ').filter { it.length >= 5 }

}


