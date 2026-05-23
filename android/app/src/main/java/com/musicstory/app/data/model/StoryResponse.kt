package com.musicstory.app.data.model

import com.google.gson.annotations.SerializedName

data class StoryRequest(
    val artist: String,
    val title: String,
    @SerializedName("previous_scripts") val previousScripts: List<String> = emptyList(),
)

data class StoryResponse(
    val artist: String,
    val title: String,
    val year: Int? = null,
    val genre: String? = null,
    val mbid: String? = null,
    val script: String,
    @SerializedName("word_count") val wordCount: Int = 0,
    val voiceId: String? = null,
    val demo: Boolean = false,
    val audioUrl: String? = null,
    val audioFile: String? = null,
    val ttsHint: String? = null,
    val sources: StorySources? = null,
)

data class StorySources(
    val musicbrainz: Boolean = false,
    val groq: Boolean = false,
    @SerializedName("yandexTts") val yandexTts: Boolean = false,
)
