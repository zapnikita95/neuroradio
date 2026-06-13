package com.musicstory.app.ui

import com.musicstory.app.domain.EdgeVoicePreset
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.GroqModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.OpenRouterModel
import com.musicstory.app.domain.ResolvedAppLanguage
import com.musicstory.app.domain.ServerTtsProvider
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsPlaybackEngine
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.domain.UserTtsBilling

fun StoryNarrator.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        StoryNarrator.AUTO -> "Auto"
        StoryNarrator.RADIO_HOST -> "Radio host"
        StoryNarrator.CONTEMPORARY -> "Contemporary"
        StoryNarrator.EXPERT -> "Genre expert"
        StoryNarrator.FAN -> "Superfan"
        StoryNarrator.BACKSTAGE -> "Backstage insider"
        StoryNarrator.NIGHT_DJ -> "Night DJ"
    } else labelRu

fun StoryNarrator.uiDescription(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        StoryNarrator.AUTO -> "Persona picked from track genre and era"
        StoryNarrator.RADIO_HOST -> "Warm on-air tone — lively but factual"
        StoryNarrator.CONTEMPORARY -> "First-person nostalgia — you lived when the track dropped"
        StoryNarrator.EXPERT -> "Podcast expertise — genre mechanics, not a lecture"
        StoryNarrator.FAN -> "Enthusiastic collector from the first person"
        StoryNarrator.BACKSTAGE -> "Insider tone when the fact has a twist"
        StoryNarrator.NIGHT_DJ -> "Quiet night shift — clear fact, slow tempo"
    } else descriptionRu

fun TtsVoice.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        TtsVoice.AUTO -> "Auto"
        TtsVoice.ALENA -> "Alena"
        TtsVoice.FILIPP -> "Filipp"
        TtsVoice.ERMIL -> "Ermil"
        TtsVoice.JANE -> "Jane"
        TtsVoice.OMAZH -> "Omazh"
        TtsVoice.ZAHAR -> "Zahar"
        TtsVoice.MARINA -> "Marina"
        TtsVoice.DASHA -> "Dasha"
        TtsVoice.JULIA -> "Julia"
        TtsVoice.KIRILL -> "Kirill"
        TtsVoice.MASHA -> "Masha"
        TtsVoice.ALEXANDER -> "Alexander"
        TtsVoice.LERA -> "Lera"
    } else labelRu

fun TtsVoice.uiDescription(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        TtsVoice.AUTO -> "Voice matched to track era and genre"
        TtsVoice.ALENA -> "Female · soft and friendly"
        TtsVoice.FILIPP -> "Male · steady and pleasant"
        TtsVoice.ERMIL -> "Male · neutral and calm"
        TtsVoice.JANE -> "Female · strict and clear"
        TtsVoice.OMAZH -> "Female · strict and dramatic"
        TtsVoice.ZAHAR -> "Male · deep and confident"
        TtsVoice.MARINA -> "Female · warm and soft"
        TtsVoice.DASHA -> "Female · lively and modern"
        TtsVoice.JULIA -> "Female · low, composed"
        TtsVoice.KIRILL -> "Male · strict and businesslike"
        TtsVoice.MASHA -> "Female · friendly and light"
        TtsVoice.ALEXANDER -> "Male · neutral and versatile"
        TtsVoice.LERA -> "Female · young and lively"
    } else descriptionRu

fun EdgeVoicePreset.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        EdgeVoicePreset.DMITRY_CALM -> "Dmitry — calm"
        EdgeVoicePreset.SVETLANA_CALM -> "Svetlana — calm"
        EdgeVoicePreset.DMITRY_LIVELY -> "Dmitry — lively"
        EdgeVoicePreset.SVETLANA_LIVELY -> "Svetlana — lively"
        EdgeVoicePreset.DARIA -> "Daria — soft"
    } else labelRu

fun EdgeVoicePreset.uiDescription(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        EdgeVoicePreset.DMITRY_CALM -> "Male · steady Microsoft Edge voice"
        EdgeVoicePreset.SVETLANA_CALM -> "Female · neutral Microsoft Edge voice"
        EdgeVoicePreset.DMITRY_LIVELY -> "Male · energetic, radio-like delivery"
        EdgeVoicePreset.SVETLANA_LIVELY -> "Female · expressive Microsoft Edge voice"
        EdgeVoicePreset.DARIA -> "Female · soft Microsoft Edge tone"
    } else descriptionRu

fun StoryLength.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        StoryLength.SEC_30 -> "30 seconds · fast"
        StoryLength.SEC_60 -> "1 minute · default"
        StoryLength.UNLIMITED -> "Extended"
    } else labelRu

fun TtsSpeed.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        TtsSpeed.VERY_SLOW -> "Very slow"
        TtsSpeed.SLOW -> "Slow"
        TtsSpeed.NORMAL -> "Normal"
        TtsSpeed.FAST -> "Fast"
        TtsSpeed.VERY_FAST -> "Very fast"
    } else labelRu

fun TtsEmotion.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        TtsEmotion.NEUTRAL -> "Neutral"
        TtsEmotion.LIVELY -> "Lively"
        TtsEmotion.STRICT -> "Strict"
    } else labelRu

fun TtsEmotion.uiDescription(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        TtsEmotion.NEUTRAL -> "Even, calm delivery"
        TtsEmotion.LIVELY -> "Friendly, warm intonation"
        TtsEmotion.STRICT -> "Firm, dramatic — best with strict voices"
    } else descriptionRu

fun ServerTtsProvider.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        ServerTtsProvider.EDGE -> "Microsoft Edge"
        ServerTtsProvider.YANDEX -> "Yandex SpeechKit"
    } else labelRu

fun LlmProvider.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN && this == LlmProvider.LOCAL) "Local" else labelRu

fun TtsPlaybackEngine.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) "Server voiceover" else labelRu

fun UserTtsBilling.uiLabel(lang: ResolvedAppLanguage): String =
    if (lang == ResolvedAppLanguage.EN) when (this) {
        UserTtsBilling.SERVER -> "App server"
        UserTtsBilling.YANDEX -> "Your Yandex SpeechKit key"
        UserTtsBilling.SBER -> "Your SaluteSpeech (Sber)"
    } else labelRu
