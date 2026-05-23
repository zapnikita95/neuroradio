package com.musicstory.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TriggerMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "music_story_settings",
)

class SettingsDataStore(private val context: Context) {

    val autoIntercept: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_AUTO_INTERCEPT] ?: DEFAULT_AUTO_INTERCEPT
    }

    val everyNTracks: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_EVERY_N_TRACKS] ?: DEFAULT_EVERY_N_TRACKS
    }

    val backendUrl: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_BACKEND_URL].orEmpty().trim().ifBlank { DEFAULT_BACKEND_URL }
    }

    val triggerMode: Flow<TriggerMode> = context.settingsDataStore.data.map { prefs ->
        TriggerMode.fromName(prefs[KEY_TRIGGER_MODE] ?: TriggerMode.EVERY_N_TRACKS.name)
    }

    val specificArtists: Flow<Set<String>> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SPECIFIC_ARTISTS] ?: emptySet()
    }

    val specificGenres: Flow<Set<String>> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SPECIFIC_GENRES] ?: emptySet()
    }

    val manualMode: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_MANUAL_MODE] ?: false
    }

    val groqApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_GROQ_API_KEY] ?: ""
    }

    val sameTrackStoryEveryN: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SAME_TRACK_STORY_EVERY_N] ?: DEFAULT_SAME_TRACK_STORY_EVERY_N
    }

    val storyLength: Flow<StoryLength> = context.settingsDataStore.data.map { prefs ->
        StoryLength.fromId(prefs[KEY_STORY_LENGTH])
    }

    val ttsSpeed: Flow<TtsSpeed> = context.settingsDataStore.data.map { prefs ->
        TtsSpeed.fromId(prefs[KEY_TTS_SPEED])
    }

    val ttsEmotion: Flow<TtsEmotion> = context.settingsDataStore.data.map { prefs ->
        TtsEmotion.fromId(prefs[KEY_TTS_EMOTION])
    }

    suspend fun setAutoIntercept(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_AUTO_INTERCEPT] = enabled }
    }

    suspend fun setEveryNTracks(n: Int) {
        context.settingsDataStore.edit { it[KEY_EVERY_N_TRACKS] = n.coerceAtLeast(1) }
    }

    suspend fun setBackendUrl(url: String) {
        context.settingsDataStore.edit { it[KEY_BACKEND_URL] = url.trimEnd('/') }
    }

    suspend fun readAuthState(): AuthState {
        val prefs = context.settingsDataStore.data.first()
        return AuthState(
            installId = prefs[KEY_AUTH_INSTALL_ID].orEmpty(),
            accessToken = prefs[KEY_AUTH_ACCESS_TOKEN].orEmpty(),
            expiresAtMs = prefs[KEY_AUTH_EXPIRES_AT] ?: 0L,
        )
    }

    suspend fun saveInstallId(installId: String) {
        context.settingsDataStore.edit { it[KEY_AUTH_INSTALL_ID] = installId }
    }

    suspend fun saveAuthToken(token: String, expiresAtMs: Long) {
        context.settingsDataStore.edit {
            it[KEY_AUTH_ACCESS_TOKEN] = token
            it[KEY_AUTH_EXPIRES_AT] = expiresAtMs
        }
    }

    suspend fun clearAuthToken() {
        context.settingsDataStore.edit {
            it.remove(KEY_AUTH_ACCESS_TOKEN)
            it.remove(KEY_AUTH_EXPIRES_AT)
        }
    }

    suspend fun setTriggerMode(mode: TriggerMode) {
        context.settingsDataStore.edit { it[KEY_TRIGGER_MODE] = mode.name }
    }

    suspend fun setSpecificArtists(artists: Set<String>) {
        context.settingsDataStore.edit {
            it[KEY_SPECIFIC_ARTISTS] = artists.map { name -> name.trim() }.filter { name -> name.isNotEmpty() }.toSet()
        }
    }

    suspend fun setSpecificGenres(genres: Set<String>) {
        context.settingsDataStore.edit {
            it[KEY_SPECIFIC_GENRES] = genres.map { name -> name.trim() }.filter { name -> name.isNotEmpty() }.toSet()
        }
    }

    suspend fun setManualMode(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_MANUAL_MODE] = enabled }
    }

    suspend fun setGroqApiKey(key: String) {
        context.settingsDataStore.edit { it[KEY_GROQ_API_KEY] = key.trim() }
    }

    suspend fun setSameTrackStoryEveryN(n: Int) {
        context.settingsDataStore.edit {
            it[KEY_SAME_TRACK_STORY_EVERY_N] = n.coerceIn(1, 20)
        }
    }

    suspend fun setStoryLength(length: StoryLength) {
        context.settingsDataStore.edit { it[KEY_STORY_LENGTH] = length.id }
    }

    suspend fun setTtsSpeed(speed: TtsSpeed) {
        context.settingsDataStore.edit { it[KEY_TTS_SPEED] = speed.id }
    }

    suspend fun setTtsEmotion(emotion: TtsEmotion) {
        context.settingsDataStore.edit { it[KEY_TTS_EMOTION] = emotion.id }
    }

    companion object {
        const val DEFAULT_BACKEND_URL = "https://music-story-production.up.railway.app"
        const val DEFAULT_EVERY_N_TRACKS = 10
        const val DEFAULT_SAME_TRACK_STORY_EVERY_N = 3
        const val DEFAULT_AUTO_INTERCEPT = true

        private val KEY_AUTO_INTERCEPT = booleanPreferencesKey("auto_intercept")
        private val KEY_EVERY_N_TRACKS = intPreferencesKey("every_n_tracks")
        private val KEY_BACKEND_URL = stringPreferencesKey("backend_url")
        private val KEY_AUTH_INSTALL_ID = stringPreferencesKey("auth_install_id")
        private val KEY_AUTH_ACCESS_TOKEN = stringPreferencesKey("auth_access_token")
        private val KEY_AUTH_EXPIRES_AT = longPreferencesKey("auth_expires_at")
        private val KEY_TRIGGER_MODE = stringPreferencesKey("trigger_mode")
        private val KEY_SPECIFIC_ARTISTS = stringSetPreferencesKey("specific_artists")
        private val KEY_SPECIFIC_GENRES = stringSetPreferencesKey("specific_genres")
        private val KEY_MANUAL_MODE = booleanPreferencesKey("manual_mode")
        private val KEY_GROQ_API_KEY = stringPreferencesKey("groq_api_key")
        private val KEY_SAME_TRACK_STORY_EVERY_N = intPreferencesKey("same_track_story_every_n")
        private val KEY_STORY_LENGTH = stringPreferencesKey("story_length")
        private val KEY_TTS_SPEED = stringPreferencesKey("tts_speed")
        private val KEY_TTS_EMOTION = stringPreferencesKey("tts_emotion")
    }
}

data class AuthState(
    val installId: String,
    val accessToken: String,
    val expiresAtMs: Long,
)
