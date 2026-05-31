package com.musicstory.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.musicstory.app.domain.AppPowerMode
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.GroqModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.OpenRouterModel
import com.musicstory.app.domain.MusicInterruptionMode
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.domain.TriggerMode
import com.musicstory.app.util.StoryLog
import com.musicstory.app.util.ApiKeySanitizer
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

    val tracksSinceLastStory: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_TRACKS_SINCE_LAST_STORY] ?: 0
    }

    val firstAutoStoryCompleted: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_FIRST_AUTO_STORY_COMPLETED] ?: false
    }

    val settingsTourPending: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SETTINGS_TOUR_PENDING] ?: false
    }

    val settingsTourCompleted: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SETTINGS_TOUR_COMPLETED] ?: false
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

    val syncCode: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SYNC_CODE].orEmpty()
    }

    val accountLinked: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_ACCOUNT_LINKED] ?: false
    }

    suspend fun setSyncCode(code: String) {
        context.settingsDataStore.edit {
            it[KEY_SYNC_CODE] = code.trim()
            it[KEY_ACCOUNT_LINKED] = code.isNotBlank()
        }
    }

    suspend fun setAccountLinked(linked: Boolean) {
        context.settingsDataStore.edit { it[KEY_ACCOUNT_LINKED] = linked }
    }

    val groqApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_GROQ_API_KEY] ?: ""
    }

    val geminiApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_GEMINI_API_KEY] ?: ""
    }

    val openRouterApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_OPENROUTER_API_KEY] ?: ""
    }

    val localOllamaUrl: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_LOCAL_OLLAMA_URL].orEmpty().trim().ifBlank { DEFAULT_LOCAL_OLLAMA_URL }
    }

    val localOllamaModel: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_LOCAL_OLLAMA_MODEL].orEmpty().trim().ifBlank { DEFAULT_LOCAL_OLLAMA_MODEL }
    }

    val llmProvider: Flow<LlmProvider> = context.settingsDataStore.data.map { prefs ->
        LlmProvider.fromId(prefs[KEY_LLM_PROVIDER])
    }

    val geminiModel: Flow<GeminiModel> = context.settingsDataStore.data.map { prefs ->
        GeminiModel.fromId(prefs[KEY_GEMINI_MODEL])
    }

    val groqModel: Flow<GroqModel> = context.settingsDataStore.data.map { prefs ->
        GroqModel.fromId(prefs[KEY_GROQ_MODEL])
    }

    val groqCustomModelId: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_GROQ_CUSTOM_MODEL] ?: ""
    }

    val openRouterModel: Flow<OpenRouterModel> = context.settingsDataStore.data.map { prefs ->
        OpenRouterModel.fromId(prefs[KEY_OPENROUTER_MODEL])
    }

    val openRouterCustomModelId: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_OPENROUTER_CUSTOM_MODEL] ?: ""
    }

    val sameTrackStoryEveryN: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SAME_TRACK_STORY_EVERY_N] ?: DEFAULT_SAME_TRACK_STORY_EVERY_N
    }

    val storyLength: Flow<StoryLength> = context.settingsDataStore.data.map { prefs ->
        StoryLength.fromId(prefs[KEY_STORY_LENGTH])
    }

    val storyNarrator: Flow<StoryNarrator> = context.settingsDataStore.data.map { prefs ->
        StoryNarrator.fromId(prefs[KEY_STORY_NARRATOR])
    }

    val ttsVoice: Flow<TtsVoice> = context.settingsDataStore.data.map { prefs ->
        TtsVoice.fromId(prefs[KEY_TTS_VOICE])
    }

    val ttsSpeed: Flow<TtsSpeed> = context.settingsDataStore.data.map { prefs ->
        TtsSpeed.fromId(prefs[KEY_TTS_SPEED])
    }

    val ttsEmotion: Flow<TtsEmotion> = context.settingsDataStore.data.map { prefs ->
        TtsEmotion.fromId(prefs[KEY_TTS_EMOTION])
    }

    val appPowerMode: Flow<AppPowerMode> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_APP_POWER_MODE]?.let { AppPowerMode.fromId(it) }
            ?: if (prefs[KEY_MONITOR_PAUSED_BY_USER] == true) AppPowerMode.OFF else AppPowerMode.ON
    }

    val monitorPausedByUser: Flow<Boolean> = appPowerMode.map { it == AppPowerMode.OFF }

    val musicInterruptionMode: Flow<MusicInterruptionMode> = context.settingsDataStore.data.map { prefs ->
        MusicInterruptionMode.fromId(prefs[KEY_MUSIC_INTERRUPTION_MODE])
    }

    val musicFadeSeconds: Flow<Float> = context.settingsDataStore.data.map { prefs ->
        (prefs[KEY_MUSIC_FADE_SECONDS] ?: DEFAULT_MUSIC_FADE_SECONDS).coerceIn(0.5f, 8f)
    }

    suspend fun setAutoIntercept(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_AUTO_INTERCEPT] = enabled }
    }

    suspend fun setEveryNTracks(n: Int) {
        context.settingsDataStore.edit { it[KEY_EVERY_N_TRACKS] = n.coerceAtLeast(1) }
    }

    suspend fun setTracksSinceLastStory(count: Int) {
        context.settingsDataStore.edit {
            it[KEY_TRACKS_SINCE_LAST_STORY] = count.coerceAtLeast(0)
        }
    }

    suspend fun setFirstAutoStoryCompleted(completed: Boolean) {
        context.settingsDataStore.edit { it[KEY_FIRST_AUTO_STORY_COMPLETED] = completed }
    }

    suspend fun setSettingsTourPending(pending: Boolean) {
        context.settingsDataStore.edit { it[KEY_SETTINGS_TOUR_PENDING] = pending }
    }

    suspend fun setSettingsTourCompleted(completed: Boolean) {
        context.settingsDataStore.edit {
            it[KEY_SETTINGS_TOUR_COMPLETED] = completed
            if (completed) it[KEY_SETTINGS_TOUR_PENDING] = false
        }
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
        context.settingsDataStore.edit { it[KEY_GROQ_API_KEY] = ApiKeySanitizer.clean(key) }
    }

    suspend fun setGeminiApiKey(key: String) {
        context.settingsDataStore.edit { it[KEY_GEMINI_API_KEY] = ApiKeySanitizer.clean(key) }
    }

    suspend fun setOpenRouterApiKey(key: String) {
        context.settingsDataStore.edit { it[KEY_OPENROUTER_API_KEY] = ApiKeySanitizer.clean(key) }
    }

    suspend fun setLocalOllamaUrl(url: String) {
        context.settingsDataStore.edit {
            it[KEY_LOCAL_OLLAMA_URL] = url.trim().trimEnd('/').ifBlank { DEFAULT_LOCAL_OLLAMA_URL }
        }
    }

    suspend fun setLocalOllamaModel(model: String) {
        context.settingsDataStore.edit {
            it[KEY_LOCAL_OLLAMA_MODEL] = model.trim().ifBlank { DEFAULT_LOCAL_OLLAMA_MODEL }
        }
    }

    suspend fun setLlmProvider(provider: LlmProvider) {
        val prefs = context.settingsDataStore.data.first()
        val previous = LlmProvider.fromId(prefs[KEY_LLM_PROVIDER])
        val installId = prefs[KEY_AUTH_INSTALL_ID].orEmpty().take(8).ifBlank { "no-install" }
        context.settingsDataStore.edit {
            it[KEY_LLM_PROVIDER] = provider.id
        }
        if (previous != provider) {
            StoryLog.i(
                "SETTINGS install=$installId LLM provider changed: " +
                    "${previous.id} (${previous.labelRu}) -> ${provider.id} (${provider.labelRu})",
            )
        } else {
            StoryLog.i(
                "SETTINGS install=$installId LLM provider confirmed: ${provider.id} (${provider.labelRu})",
            )
        }
    }

    suspend fun setGeminiModel(model: GeminiModel) {
        context.settingsDataStore.edit { it[KEY_GEMINI_MODEL] = model.id }
    }

    suspend fun setGroqModel(model: GroqModel) {
        context.settingsDataStore.edit { it[KEY_GROQ_MODEL] = model.id }
    }

    suspend fun setGroqCustomModelId(modelId: String) {
        context.settingsDataStore.edit { it[KEY_GROQ_CUSTOM_MODEL] = modelId.trim() }
    }

    suspend fun setOpenRouterModel(model: OpenRouterModel) {
        context.settingsDataStore.edit { it[KEY_OPENROUTER_MODEL] = model.id }
    }

    suspend fun setOpenRouterCustomModelId(modelId: String) {
        context.settingsDataStore.edit { it[KEY_OPENROUTER_CUSTOM_MODEL] = modelId.trim() }
    }

    suspend fun setSameTrackStoryEveryN(n: Int) {
        context.settingsDataStore.edit {
            it[KEY_SAME_TRACK_STORY_EVERY_N] = n.coerceIn(1, 20)
        }
    }

    suspend fun setStoryLength(length: StoryLength) {
        context.settingsDataStore.edit { it[KEY_STORY_LENGTH] = length.id }
    }

    suspend fun setStoryNarrator(narrator: StoryNarrator) {
        context.settingsDataStore.edit { it[KEY_STORY_NARRATOR] = narrator.id }
    }

    suspend fun setTtsVoice(voice: TtsVoice) {
        context.settingsDataStore.edit { it[KEY_TTS_VOICE] = voice.id }
    }

    suspend fun setTtsSpeed(speed: TtsSpeed) {
        context.settingsDataStore.edit { it[KEY_TTS_SPEED] = speed.id }
    }

    suspend fun setTtsEmotion(emotion: TtsEmotion) {
        context.settingsDataStore.edit { it[KEY_TTS_EMOTION] = emotion.id }
    }

    suspend fun setAppPowerMode(mode: AppPowerMode) {
        context.settingsDataStore.edit {
            it[KEY_APP_POWER_MODE] = mode.id
            it[KEY_MONITOR_PAUSED_BY_USER] = mode == AppPowerMode.OFF
        }
    }

    suspend fun setMonitorPausedByUser(paused: Boolean) {
        setAppPowerMode(if (paused) AppPowerMode.OFF else AppPowerMode.ON)
    }

    suspend fun currentAppPowerMode(): AppPowerMode = appPowerMode.first()

    suspend fun setMusicInterruptionMode(mode: MusicInterruptionMode) {
        context.settingsDataStore.edit { it[KEY_MUSIC_INTERRUPTION_MODE] = mode.id }
    }

    suspend fun setMusicFadeSeconds(seconds: Float) {
        context.settingsDataStore.edit { it[KEY_MUSIC_FADE_SECONDS] = seconds.coerceIn(0.5f, 8f) }
    }

    suspend fun isMonitorPausedByUser(): Boolean = monitorPausedByUser.first()

    companion object {
        const val DEFAULT_BACKEND_URL = "https://music-story-production.up.railway.app"
        const val DEFAULT_EVERY_N_TRACKS = 10
        const val DEFAULT_SAME_TRACK_STORY_EVERY_N = 3
        const val DEFAULT_AUTO_INTERCEPT = true
        const val DEFAULT_MUSIC_FADE_SECONDS = 1.5f
        /** URL Ollama с точки зрения ПК с BFF (не телефона). */
        const val DEFAULT_LOCAL_OLLAMA_URL = "http://127.0.0.1:11435"
        const val DEFAULT_LOCAL_OLLAMA_MODEL = "qwen3.6:35b-a3b-q4_K_M"
        /** Shown in UI when switching to Local — user picks IP from start-local-bff.bat */
        const val SUGGESTED_LOCAL_BACKEND_URL = "http://10.196.221.190:3000"

        private val KEY_AUTO_INTERCEPT = booleanPreferencesKey("auto_intercept")
        private val KEY_EVERY_N_TRACKS = intPreferencesKey("every_n_tracks")
        private val KEY_TRACKS_SINCE_LAST_STORY = intPreferencesKey("tracks_since_last_story")
        private val KEY_FIRST_AUTO_STORY_COMPLETED = booleanPreferencesKey("first_auto_story_completed")
        private val KEY_SETTINGS_TOUR_PENDING = booleanPreferencesKey("settings_tour_pending")
        private val KEY_SETTINGS_TOUR_COMPLETED = booleanPreferencesKey("settings_tour_completed")
        private val KEY_BACKEND_URL = stringPreferencesKey("backend_url")
        private val KEY_AUTH_INSTALL_ID = stringPreferencesKey("auth_install_id")
        private val KEY_AUTH_ACCESS_TOKEN = stringPreferencesKey("auth_access_token")
        private val KEY_AUTH_EXPIRES_AT = longPreferencesKey("auth_expires_at")
        private val KEY_TRIGGER_MODE = stringPreferencesKey("trigger_mode")
        private val KEY_SPECIFIC_ARTISTS = stringSetPreferencesKey("specific_artists")
        private val KEY_SPECIFIC_GENRES = stringSetPreferencesKey("specific_genres")
        private val KEY_MANUAL_MODE = booleanPreferencesKey("manual_mode")
        private val KEY_GROQ_API_KEY = stringPreferencesKey("groq_api_key")
        private val KEY_GEMINI_API_KEY = stringPreferencesKey("gemini_api_key")
        private val KEY_OPENROUTER_API_KEY = stringPreferencesKey("openrouter_api_key")
        private val KEY_LOCAL_OLLAMA_URL = stringPreferencesKey("local_ollama_url")
        private val KEY_LOCAL_OLLAMA_MODEL = stringPreferencesKey("local_ollama_model")
        private val KEY_LLM_PROVIDER = stringPreferencesKey("llm_provider")
        private val KEY_LLM_PROVIDER_DEFAULTED_TO_OPENROUTER = booleanPreferencesKey("llm_provider_defaulted_to_openrouter")
        private val KEY_OPENROUTER_FORCE_VERSION = intPreferencesKey("openrouter_force_version")
        private val KEY_GEMINI_MODEL = stringPreferencesKey("gemini_model")
        private val KEY_GROQ_MODEL = stringPreferencesKey("groq_model")
        private val KEY_GROQ_CUSTOM_MODEL = stringPreferencesKey("groq_custom_model")
        private val KEY_OPENROUTER_MODEL = stringPreferencesKey("openrouter_model")
        private val KEY_OPENROUTER_CUSTOM_MODEL = stringPreferencesKey("openrouter_custom_model")
        private val KEY_SAME_TRACK_STORY_EVERY_N = intPreferencesKey("same_track_story_every_n")
        private val KEY_STORY_LENGTH = stringPreferencesKey("story_length")
        private val KEY_STORY_NARRATOR = stringPreferencesKey("story_narrator")
        private val KEY_TTS_VOICE = stringPreferencesKey("tts_voice")
        private val KEY_TTS_SPEED = stringPreferencesKey("tts_speed")
        private val KEY_TTS_EMOTION = stringPreferencesKey("tts_emotion")
        private val KEY_APP_POWER_MODE = stringPreferencesKey("app_power_mode")
        private val KEY_MONITOR_PAUSED_BY_USER = booleanPreferencesKey("monitor_paused_by_user")
        private val KEY_MUSIC_INTERRUPTION_MODE = stringPreferencesKey("music_interruption_mode")
        private val KEY_MUSIC_FADE_SECONDS = floatPreferencesKey("music_fade_seconds")
        private val KEY_SYNC_CODE = stringPreferencesKey("sync_code")
        private val KEY_ACCOUNT_LINKED = booleanPreferencesKey("account_linked")
        private const val OPENROUTER_FORCE_VERSION = 2
    }
}

data class AuthState(
    val installId: String,
    val accessToken: String,
    val expiresAtMs: Long,
)
