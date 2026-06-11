package com.musicstory.app.data.model

import com.google.gson.annotations.SerializedName
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice

data class StoryRequest(
    val artist: String,
    val title: String,
    @SerializedName("previous_scripts") val previousScripts: List<String> = emptyList(),
    @SerializedName("story_length") val storyLength: String = StoryLength.SEC_60.id,
    @SerializedName("story_narrator") val storyNarrator: String = StoryNarrator.AUTO.id,
    @SerializedName("tts_voice") val ttsVoice: String = TtsVoice.AUTO.id,
    @SerializedName("tts_speed") val ttsSpeed: Float = TtsSpeed.NORMAL.yandexSpeed,
    @SerializedName("tts_emotion") val ttsEmotion: String = TtsEmotion.LIVELY.id,
    @SerializedName("llm_provider") val llmProvider: String? = null,
    @SerializedName("gemini_model") val geminiModel: String? = null,
    @SerializedName("groq_model") val groqModel: String? = null,
    @SerializedName("openrouter_model") val openRouterModel: String? = null,
    @SerializedName("groq_api_key") val groqApiKey: String? = null,
    @SerializedName("gemini_api_key") val geminiApiKey: String? = null,
    @SerializedName("openrouter_api_key") val openRouterApiKey: String? = null,
    @SerializedName("local_ollama_url") val localOllamaUrl: String? = null,
    @SerializedName("local_ollama_model") val localOllamaModel: String? = null,
    @SerializedName("tts_provider") val ttsProvider: String? = null,
    @SerializedName("user_tts_provider") val userTtsProvider: String? = null,
    @SerializedName("yandex_api_key") val yandexApiKey: String? = null,
    @SerializedName("yandex_folder_id") val yandexFolderId: String? = null,
    @SerializedName("salute_auth_key") val saluteAuthKey: String? = null,
    @SerializedName("client_secrets_enc") val clientSecretsEnc: String? = null,
    @SerializedName("skip_server_tts") val skipServerTts: Boolean = false,
    @SerializedName("voice_tier") val voiceTier: String? = null,
    @SerializedName("silero_voice_preset") val sileroVoicePreset: String? = null,
    @SerializedName("silero_voice") val sileroVoice: String? = null,
    @SerializedName("edge_voice_preset") val edgeVoicePreset: String? = null,
    @SerializedName("speak_track_names_in_voiceover") val speakTrackNamesInVoiceover: Boolean = true,
    @SerializedName("story_language") val storyLanguage: String = "ru",
)

data class StoryResponse(
    val artist: String,
    val title: String,
    val year: Int? = null,
    val genre: String? = null,
    val mbid: String? = null,
    val script: String,
    @SerializedName("word_count") val wordCount: Int = 0,
    @SerializedName("tts_transcript") val ttsTranscript: String? = null,
    val voiceId: String? = null,
    val demo: Boolean = false,
    val audioUrl: String? = null,
    val audioFile: String? = null,
    val ttsHint: String? = null,
    val sources: StorySources? = null,
    val quota: StoryQuotaInfo? = null,
    @SerializedName("seed_fact") val seedFact: String? = null,
    @SerializedName("seed_scope") val seedScope: String? = null,
    @SerializedName("seed_interest_score") val seedInterestScore: Int? = null,
    @SerializedName("seed_interest_rating") val seedInterestRating: Int? = null,
)

data class StorySources(
    val musicbrainz: Boolean = false,
    val groq: Boolean = false,
    @SerializedName("yandexTts") val yandexTts: Boolean = false,
)

data class StoryQuotaInfo(
    val used: Int = 0,
    val limit: Int = 10,
    val remaining: Int = 10,
    @SerializedName("resetsAt") val resetsAt: Long = 0,
    val tier: String? = null,
    @SerializedName("monthlyUsed") val monthlyUsed: Int? = null,
    @SerializedName("monthlyLimit") val monthlyLimit: Int? = null,
    @SerializedName("monthlyRemaining") val monthlyRemaining: Int? = null,
    @SerializedName("monthlyResetsAt") val monthlyResetsAt: Long? = null,
)
