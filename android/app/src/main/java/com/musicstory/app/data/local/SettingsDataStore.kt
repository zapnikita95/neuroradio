package com.musicstory.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.musicstory.app.domain.TriggerMode
import kotlinx.coroutines.flow.Flow
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
        prefs[KEY_BACKEND_URL] ?: DEFAULT_BACKEND_URL
    }

    val backendSecret: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_BACKEND_SECRET] ?: ""
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

    suspend fun setAutoIntercept(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_AUTO_INTERCEPT] = enabled }
    }

    suspend fun setEveryNTracks(n: Int) {
        context.settingsDataStore.edit { it[KEY_EVERY_N_TRACKS] = n.coerceAtLeast(1) }
    }

    suspend fun setBackendUrl(url: String) {
        context.settingsDataStore.edit { it[KEY_BACKEND_URL] = url.trimEnd('/') }
    }

    suspend fun setBackendSecret(secret: String) {
        context.settingsDataStore.edit { it[KEY_BACKEND_SECRET] = secret.trim() }
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

    companion object {
        const val DEFAULT_BACKEND_URL = ""
        const val DEFAULT_EVERY_N_TRACKS = 10
        const val DEFAULT_SAME_TRACK_STORY_EVERY_N = 3
        const val DEFAULT_AUTO_INTERCEPT = true

        private val KEY_AUTO_INTERCEPT = booleanPreferencesKey("auto_intercept")
        private val KEY_EVERY_N_TRACKS = intPreferencesKey("every_n_tracks")
        private val KEY_BACKEND_URL = stringPreferencesKey("backend_url")
        private val KEY_BACKEND_SECRET = stringPreferencesKey("backend_secret")
        private val KEY_TRIGGER_MODE = stringPreferencesKey("trigger_mode")
        private val KEY_SPECIFIC_ARTISTS = stringSetPreferencesKey("specific_artists")
        private val KEY_SPECIFIC_GENRES = stringSetPreferencesKey("specific_genres")
        private val KEY_MANUAL_MODE = booleanPreferencesKey("manual_mode")
        private val KEY_GROQ_API_KEY = stringPreferencesKey("groq_api_key")
        private val KEY_SAME_TRACK_STORY_EVERY_N = intPreferencesKey("same_track_story_every_n")
    }
}
