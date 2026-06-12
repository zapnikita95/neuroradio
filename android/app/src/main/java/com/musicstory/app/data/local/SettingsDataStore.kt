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
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import com.musicstory.app.domain.AppPowerMode
import com.musicstory.app.domain.OfflinePackPhase
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.GroqModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.OpenRouterModel
import com.musicstory.app.domain.MusicInterruptionMode
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.EdgeVoicePreset
import com.musicstory.app.domain.ServerTtsProvider
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsPlaybackEngine
import com.musicstory.app.domain.UserTtsBilling
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.AppLanguage
import com.musicstory.app.domain.ElevenLabsVoice
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.util.LocaleHelper
import com.musicstory.app.domain.TriggerMode
import com.musicstory.app.util.ApiKeySanitizer
import com.musicstory.app.util.BackendUrlRules
import com.musicstory.app.util.StoryLog
import com.musicstory.app.security.SecureApiKeyStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "music_story_settings",
    corruptionHandler = ReplaceFileCorruptionHandler(
        produceNewData = {
            StoryLog.w("Settings DataStore corrupted — resetting to defaults")
            emptyPreferences()
        },
    ),
)

class SettingsDataStore(private val context: Context) {

    private val secureApiKeyStore = SecureApiKeyStore(context)

    init {
        if (secureApiKeyStore.usesPlainFallback()) {
            StoryLog.w("SettingsDataStore: encrypted key storage unavailable — plain fallback active")
        }
    }

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

    val homeTourPending: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_HOME_TOUR_PENDING] ?: false
    }

    val homeTourCompleted: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_HOME_TOUR_COMPLETED] ?: false
    }

    /** Экран входа показываем один раз; старые установки без ключа — уже прошли онбординг. */
    val accountLoginGateCompleted: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_ACCOUNT_LOGIN_GATE_COMPLETED]
            ?: prefs[KEY_HOME_TOUR_COMPLETED]
            ?: false
    }

    val suppressAutoStoryUntilMs: Flow<Long> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SUPPRESS_AUTO_STORY_UNTIL] ?: 0L
    }

    val backendUrl: Flow<String> = context.settingsDataStore.data.map { prefs ->
        BackendUrlRules.normalizeBackendUrl(
            prefs[KEY_BACKEND_URL].orEmpty().ifBlank { DEFAULT_BACKEND_URL },
        )
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

    val cachedAccountEmail: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_ACCOUNT_EMAIL].orEmpty().trim()
    }

    suspend fun readCachedAccountProfile(): CachedAccountProfile? {
        val prefs = context.settingsDataStore.data.first()
        val email = prefs[KEY_ACCOUNT_EMAIL]?.trim().orEmpty()
        val telegramUsername = prefs[KEY_ACCOUNT_TELEGRAM_USERNAME]?.trim().orEmpty()
        val telegramId = prefs[KEY_ACCOUNT_TELEGRAM_ID]?.takeIf { it > 0L }
        val plan = prefs[KEY_ACCOUNT_PLAN]?.trim().orEmpty()
        val premiumUntil = prefs[KEY_ACCOUNT_PREMIUM_UNTIL]?.takeIf { it > 0L }
        if (email.isBlank() && telegramId == null && telegramUsername.isBlank()) return null
        return CachedAccountProfile(
            accountId = prefs[KEY_ACCOUNT_ID]?.trim()?.takeIf { it.isNotBlank() },
            email = email.takeIf { it.isNotBlank() },
            telegramId = telegramId,
            telegramUsername = telegramUsername.takeIf { it.isNotBlank() },
            plan = plan.takeIf { it.isNotBlank() },
            trialUntil = prefs[KEY_ACCOUNT_TRIAL_UNTIL]?.takeIf { it > 0L },
            premiumUntil = premiumUntil,
        )
    }

    suspend fun saveAccountProfile(profile: CachedAccountProfile) {
        context.settingsDataStore.edit { prefs ->
            profile.email?.trim()?.takeIf { it.isNotBlank() }?.let { prefs[KEY_ACCOUNT_EMAIL] = it }
            profile.telegramUsername?.trim()?.takeIf { it.isNotBlank() }?.let {
                prefs[KEY_ACCOUNT_TELEGRAM_USERNAME] = it
            }
            profile.telegramId?.takeIf { it > 0L }?.let { prefs[KEY_ACCOUNT_TELEGRAM_ID] = it }
            profile.accountId?.trim()?.takeIf { it.isNotBlank() }?.let { prefs[KEY_ACCOUNT_ID] = it }
            profile.plan?.trim()?.takeIf { it.isNotBlank() }?.let { prefs[KEY_ACCOUNT_PLAN] = it }
            profile.trialUntil?.takeIf { it > 0L }?.let { prefs[KEY_ACCOUNT_TRIAL_UNTIL] = it }
            profile.premiumUntil?.takeIf { it > 0L }?.let { prefs[KEY_ACCOUNT_PREMIUM_UNTIL] = it }
            if (profile.isLoggedIn) prefs[KEY_ACCOUNT_LINKED] = true
        }
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

    suspend fun clearAccountSession() {
        context.settingsDataStore.edit { prefs ->
            prefs.remove(KEY_ACCOUNT_LINKED)
            prefs.remove(KEY_ACCOUNT_EMAIL)
            prefs.remove(KEY_ACCOUNT_ID)
            prefs.remove(KEY_ACCOUNT_PLAN)
            prefs.remove(KEY_ACCOUNT_TELEGRAM_USERNAME)
            prefs.remove(KEY_ACCOUNT_TELEGRAM_ID)
            prefs.remove(KEY_ACCOUNT_TRIAL_UNTIL)
            prefs.remove(KEY_ACCOUNT_PREMIUM_UNTIL)
            prefs.remove(KEY_SYNC_CODE)
        }
    }

    val groqApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        secureApiKeyStore.read(SecureApiKeyStore.GROQ, prefs[KEY_GROQ_API_KEY])
    }

    val geminiApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        secureApiKeyStore.read(SecureApiKeyStore.GEMINI, prefs[KEY_GEMINI_API_KEY])
    }

    val openRouterApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        secureApiKeyStore.read(SecureApiKeyStore.OPENROUTER, prefs[KEY_OPENROUTER_API_KEY])
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

    val ttsPlaybackEngine: Flow<TtsPlaybackEngine> = context.settingsDataStore.data.map { prefs ->
        TtsPlaybackEngine.fromId(prefs[KEY_TTS_PLAYBACK_ENGINE])
    }

    val edgeVoicePreset: Flow<EdgeVoicePreset> = context.settingsDataStore.data.map { prefs ->
        EdgeVoicePreset.fromId(prefs[KEY_EDGE_VOICE_PRESET] ?: prefs[KEY_SILERO_VOICE_PRESET])
    }

    val speakTrackNamesInVoiceover: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_SPEAK_TRACK_NAMES_IN_VOICEOVER] ?: DEFAULT_SPEAK_TRACK_NAMES_IN_VOICEOVER
    }

    val factNotificationsEnabled: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_FACT_NOTIFICATIONS_ENABLED] ?: DEFAULT_FACT_NOTIFICATIONS_ENABLED
    }

    val appLanguage: Flow<AppLanguage> = context.settingsDataStore.data.map { prefs ->
        AppLanguage.fromId(prefs[KEY_APP_LANGUAGE])
    }

    val elevenLabsVoice: Flow<ElevenLabsVoice> = context.settingsDataStore.data.map { prefs ->
        ElevenLabsVoice.fromId(prefs[KEY_ELEVENLABS_VOICE])
    }

    val offlineAudioCacheEnabled: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_OFFLINE_AUDIO_CACHE_ENABLED] ?: false
    }

    val offlineCachePurgeVersion: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_OFFLINE_CACHE_PURGE_VERSION] ?: 0
    }

    suspend fun setOfflineCachePurgeVersion(versionCode: Int) {
        context.settingsDataStore.edit { it[KEY_OFFLINE_CACHE_PURGE_VERSION] = versionCode }
    }

    val offlinePackPhase: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_OFFLINE_PACK_PHASE] ?: OfflinePackPhase.IDLE.id
    }

    val offlinePackSessionId: Flow<Long> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_OFFLINE_PACK_SESSION_ID] ?: 0L
    }

    val serverTtsProvider: Flow<ServerTtsProvider> = context.settingsDataStore.data.map { prefs ->
        ServerTtsProvider.fromId(prefs[KEY_SERVER_TTS_PROVIDER])
    }

    val userTtsBilling: Flow<UserTtsBilling> = context.settingsDataStore.data.map { prefs ->
        UserTtsBilling.fromId(prefs[KEY_USER_TTS_BILLING])
    }

    val yandexApiKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        secureApiKeyStore.read(SecureApiKeyStore.YANDEX, prefs[KEY_YANDEX_API_KEY])
    }

    val yandexFolderId: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_YANDEX_FOLDER_ID] ?: ""
    }

    val saluteAuthKey: Flow<String> = context.settingsDataStore.data.map { prefs ->
        secureApiKeyStore.read(SecureApiKeyStore.SALUTE, prefs[KEY_SALUTE_AUTH_KEY])
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

    val countTrackAfterListenEnabled: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_COUNT_TRACK_LISTEN_ENABLED] ?: true
    }

    val countTrackAfterListenSeconds: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        (prefs[KEY_COUNT_TRACK_LISTEN_SECONDS] ?: DEFAULT_COUNT_TRACK_LISTEN_SECONDS)
            .coerceIn(5, 300)
    }

    /** Seconds of stable playback before auto-story / scrobble. 0 only if user disabled wait in settings. */
    val trackListenThresholdSeconds: Flow<Int> = context.settingsDataStore.data.map { prefs ->
        if (prefs[KEY_COUNT_TRACK_LISTEN_ENABLED] == false) return@map 0
        (prefs[KEY_COUNT_TRACK_LISTEN_SECONDS] ?: DEFAULT_COUNT_TRACK_LISTEN_SECONDS)
            .coerceIn(5, 300)
    }

    suspend fun setAutoIntercept(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_AUTO_INTERCEPT] = enabled }
        notifyCloudSync()
    }

    /** Один переключатель: вкл = автоперехват, выкл = ручной режим (если доступен). */
    suspend fun setAutoPlaybackMode(autoEnabled: Boolean) {
        context.settingsDataStore.edit {
            it[KEY_AUTO_INTERCEPT] = autoEnabled
            it[KEY_MANUAL_MODE] = !autoEnabled
        }
        notifyCloudSync()
    }

    suspend fun setEveryNTracks(n: Int) {
        context.settingsDataStore.edit { it[KEY_EVERY_N_TRACKS] = n.coerceAtLeast(1) }
        notifyCloudSync()
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

    suspend fun setHomeTourPending(pending: Boolean) {
        context.settingsDataStore.edit { it[KEY_HOME_TOUR_PENDING] = pending }
    }

    suspend fun setHomeTourCompleted(completed: Boolean) {
        context.settingsDataStore.edit {
            it[KEY_HOME_TOUR_COMPLETED] = completed
            if (completed) it[KEY_HOME_TOUR_PENDING] = false
        }
    }

    suspend fun setAccountLoginGateCompleted(completed: Boolean) {
        context.settingsDataStore.edit { it[KEY_ACCOUNT_LOGIN_GATE_COMPLETED] = completed }
    }

    suspend fun setBackendUrl(url: String) {
        context.settingsDataStore.edit {
            it[KEY_BACKEND_URL] = BackendUrlRules.normalizeBackendUrl(url)
        }
    }

    suspend fun readAuthState(): AuthState {
        val prefs = context.settingsDataStore.data.first()
        return AuthState(
            installId = prefs[KEY_AUTH_INSTALL_ID].orEmpty(),
            accessToken = prefs[KEY_AUTH_ACCESS_TOKEN].orEmpty(),
            expiresAtMs = prefs[KEY_AUTH_EXPIRES_AT] ?: 0L,
            secretsTransportKey = secureApiKeyStore.read(SecureApiKeyStore.TRANSPORT, null),
        )
    }

    suspend fun saveInstallId(installId: String) {
        context.settingsDataStore.edit { it[KEY_AUTH_INSTALL_ID] = installId }
    }

    suspend fun saveAuthToken(token: String, expiresAtMs: Long, secretsTransportKey: String? = null) {
        context.settingsDataStore.edit {
            it[KEY_AUTH_ACCESS_TOKEN] = token
            it[KEY_AUTH_EXPIRES_AT] = expiresAtMs
        }
        secretsTransportKey?.trim()?.takeIf { it.isNotBlank() }?.let {
            secureApiKeyStore.write(SecureApiKeyStore.TRANSPORT, it)
            touchSecretsRevision()
        }
    }

    suspend fun readSecretsTransportKey(): String =
        secureApiKeyStore.read(SecureApiKeyStore.TRANSPORT, null)

    private suspend fun touchSecretsRevision() {
        context.settingsDataStore.edit { it[KEY_SECRETS_TOUCH] = System.currentTimeMillis() }
    }

    private suspend fun persistApiKey(secureName: String, legacyKey: Preferences.Key<String>, value: String) {
        secureApiKeyStore.write(secureName, value)
        context.settingsDataStore.edit {
            it.remove(legacyKey)
            it[KEY_SECRETS_TOUCH] = System.currentTimeMillis()
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
        notifyCloudSync()
    }

    suspend fun setSpecificArtists(artists: Set<String>) {
        context.settingsDataStore.edit {
            it[KEY_SPECIFIC_ARTISTS] = artists.map { name -> name.trim() }.filter { name -> name.isNotEmpty() }.toSet()
        }
        notifyCloudSync()
    }

    suspend fun setSpecificGenres(genres: Set<String>) {
        context.settingsDataStore.edit {
            it[KEY_SPECIFIC_GENRES] = genres.map { name -> name.trim() }.filter { name -> name.isNotEmpty() }.toSet()
        }
        notifyCloudSync()
    }

    suspend fun setManualMode(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_MANUAL_MODE] = enabled }
        notifyCloudSync()
    }

    suspend fun setGroqApiKey(key: String) {
        persistApiKey(SecureApiKeyStore.GROQ, KEY_GROQ_API_KEY, key)
    }

    suspend fun setGeminiApiKey(key: String) {
        persistApiKey(SecureApiKeyStore.GEMINI, KEY_GEMINI_API_KEY, key)
    }

    suspend fun setOpenRouterApiKey(key: String) {
        persistApiKey(SecureApiKeyStore.OPENROUTER, KEY_OPENROUTER_API_KEY, key)
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
        notifyCloudSync()
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
        notifyCloudSync()
    }

    suspend fun setStoryLength(length: StoryLength) {
        context.settingsDataStore.edit { it[KEY_STORY_LENGTH] = length.id }
        notifyCloudSync()
    }

    suspend fun setStoryNarrator(narrator: StoryNarrator) {
        context.settingsDataStore.edit {
            it[KEY_STORY_NARRATOR] = narrator.id
            it[KEY_SUPPRESS_AUTO_STORY_UNTIL] = System.currentTimeMillis() + 15_000L
        }
    }

    suspend fun setTtsVoice(voice: TtsVoice) {
        context.settingsDataStore.edit { it[KEY_TTS_VOICE] = voice.id }
        notifyCloudSync()
    }

    suspend fun setTtsSpeed(speed: TtsSpeed) {
        context.settingsDataStore.edit { it[KEY_TTS_SPEED] = speed.id }
        notifyCloudSync()
    }

    suspend fun setTtsEmotion(emotion: TtsEmotion) {
        context.settingsDataStore.edit { it[KEY_TTS_EMOTION] = emotion.id }
        notifyCloudSync()
    }

    suspend fun setTtsPlaybackEngine(engine: TtsPlaybackEngine) {
        context.settingsDataStore.edit { it[KEY_TTS_PLAYBACK_ENGINE] = engine.id }
        notifyCloudSync()
    }

    suspend fun setEdgeVoicePreset(preset: EdgeVoicePreset) {
        context.settingsDataStore.edit {
            it[KEY_EDGE_VOICE_PRESET] = preset.id
            it.remove(KEY_SILERO_VOICE_PRESET)
        }
        notifyCloudSync()
    }

    suspend fun setFactNotificationsEnabled(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_FACT_NOTIFICATIONS_ENABLED] = enabled }
        notifyCloudSync()
    }

    suspend fun setSpeakTrackNamesInVoiceover(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_SPEAK_TRACK_NAMES_IN_VOICEOVER] = enabled }
        notifyCloudSync()
    }

    suspend fun setAppLanguage(language: AppLanguage) {
        context.settingsDataStore.edit { it[KEY_APP_LANGUAGE] = language.id }
        LocaleHelper.persistLanguageForBoot(context, language)
        notifyCloudSync()
    }

    suspend fun setElevenLabsVoice(voice: ElevenLabsVoice) {
        context.settingsDataStore.edit { it[KEY_ELEVENLABS_VOICE] = voice.id }
        notifyCloudSync()
    }

    suspend fun setOfflineAudioCacheEnabled(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_OFFLINE_AUDIO_CACHE_ENABLED] = enabled }
        notifyCloudSync()
    }

    suspend fun setOfflinePackPhase(phase: String) {
        context.settingsDataStore.edit { it[KEY_OFFLINE_PACK_PHASE] = phase }
        notifyCloudSync()
    }

    suspend fun setOfflinePackSessionId(sessionId: Long) {
        context.settingsDataStore.edit { it[KEY_OFFLINE_PACK_SESSION_ID] = sessionId }
        notifyCloudSync()
    }

    suspend fun setServerTtsProvider(provider: ServerTtsProvider) {
        context.settingsDataStore.edit { it[KEY_SERVER_TTS_PROVIDER] = provider.id }
        notifyCloudSync()
    }

    suspend fun setUserTtsBilling(billing: UserTtsBilling) {
        context.settingsDataStore.edit { it[KEY_USER_TTS_BILLING] = billing.id }
    }

    suspend fun setYandexApiKey(key: String) {
        persistApiKey(SecureApiKeyStore.YANDEX, KEY_YANDEX_API_KEY, key)
    }

    suspend fun setYandexFolderId(folderId: String) {
        context.settingsDataStore.edit { it[KEY_YANDEX_FOLDER_ID] = folderId.trim() }
    }

    suspend fun setSaluteAuthKey(key: String) {
        persistApiKey(SecureApiKeyStore.SALUTE, KEY_SALUTE_AUTH_KEY, key)
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

    suspend fun setCountTrackAfterListenEnabled(enabled: Boolean) {
        context.settingsDataStore.edit {
            it[KEY_COUNT_TRACK_LISTEN_ENABLED] = enabled
            if (enabled && it[KEY_COUNT_TRACK_LISTEN_SECONDS] == null) {
                it[KEY_COUNT_TRACK_LISTEN_SECONDS] = DEFAULT_COUNT_TRACK_LISTEN_SECONDS
            }
        }
    }

    suspend fun setCountTrackAfterListenSeconds(seconds: Int) {
        context.settingsDataStore.edit {
            it[KEY_COUNT_TRACK_LISTEN_SECONDS] = seconds.coerceIn(5, 300)
        }
    }

    suspend fun isMonitorPausedByUser(): Boolean = monitorPausedByUser.first()

    private var cloudSyncHook: (suspend () -> Unit)? = null
    @Volatile private var batchCloudSyncDepth = 0
    private var batchCloudSyncPending = false

    /** Coalesce cloud sync during multi-field saves (Settings «Сохранить»). */
    suspend fun <T> runBatchSettingsUpdate(block: suspend () -> T): T {
        batchCloudSyncDepth++
        try {
            return block()
        } finally {
            batchCloudSyncDepth--
            if (batchCloudSyncDepth == 0 && batchCloudSyncPending) {
                batchCloudSyncPending = false
                cloudSyncHook?.invoke()
            }
        }
    }

    fun setCloudSyncHook(hook: suspend () -> Unit) {
        cloudSyncHook = hook
    }

    private suspend fun notifyCloudSync() {
        if (batchCloudSyncDepth > 0) {
            batchCloudSyncPending = true
            return
        }
        cloudSyncHook?.invoke()
    }

    suspend fun buildSyncPayload(): com.musicstory.app.data.remote.AccountSyncManager.SyncSettingsPayload {
        val prefs = context.settingsDataStore.data.first()
        return com.musicstory.app.data.remote.AccountSyncManager.SyncSettingsPayload(
            manualMode = prefs[KEY_MANUAL_MODE] ?: false,
            autoIntercept = prefs[KEY_AUTO_INTERCEPT] ?: DEFAULT_AUTO_INTERCEPT,
            factNotificationsEnabled = prefs[KEY_FACT_NOTIFICATIONS_ENABLED] ?: DEFAULT_FACT_NOTIFICATIONS_ENABLED,
            triggerMode = prefs[KEY_TRIGGER_MODE] ?: TriggerMode.EVERY_N_TRACKS.name,
            everyNTracks = prefs[KEY_EVERY_N_TRACKS] ?: DEFAULT_EVERY_N_TRACKS,
            sameTrackStoryEveryN = prefs[KEY_SAME_TRACK_STORY_EVERY_N] ?: DEFAULT_SAME_TRACK_STORY_EVERY_N,
            specificArtists = prefs[KEY_SPECIFIC_ARTISTS]?.toList() ?: emptyList(),
            specificGenres = prefs[KEY_SPECIFIC_GENRES]?.toList() ?: emptyList(),
            storyLength = prefs[KEY_STORY_LENGTH] ?: StoryLength.SEC_60.id,
            storyNarrator = prefs[KEY_STORY_NARRATOR] ?: StoryNarrator.AUTO.id,
            ttsVoice = prefs[KEY_TTS_VOICE] ?: TtsVoice.ZAHAR.id,
            ttsSpeed = prefs[KEY_TTS_SPEED] ?: TtsSpeed.NORMAL.id,
            ttsEmotion = prefs[KEY_TTS_EMOTION] ?: TtsEmotion.LIVELY.id,
            ttsPlaybackEngine = prefs[KEY_TTS_PLAYBACK_ENGINE] ?: TtsPlaybackEngine.YANDEX_SERVER.id,
            serverTtsProvider = prefs[KEY_SERVER_TTS_PROVIDER] ?: ServerTtsProvider.YANDEX.id,
            speakTrackNamesInVoiceover = prefs[KEY_SPEAK_TRACK_NAMES_IN_VOICEOVER]
                ?: DEFAULT_SPEAK_TRACK_NAMES_IN_VOICEOVER,
            llmProvider = prefs[KEY_LLM_PROVIDER] ?: LlmProvider.OPENROUTER.id,
            appLanguage = prefs[KEY_APP_LANGUAGE] ?: AppLanguage.SYSTEM.id,
            updatedAt = System.currentTimeMillis(),
        )
    }

    /** Apply server settings when remote is newer than local sync timestamp. */
    suspend fun applyRemoteSettings(
        remote: com.musicstory.app.data.remote.AccountSyncManager.SyncSettingsPayload,
    ): Boolean {
        val remoteAt = remote.updatedAt
        val localAt = context.settingsDataStore.data.first()[KEY_SETTINGS_SYNCED_AT] ?: 0L
        if (remoteAt <= localAt) return false
        context.settingsDataStore.edit { prefs ->
            remote.manualMode?.let { prefs[KEY_MANUAL_MODE] = it }
            remote.autoIntercept?.let { prefs[KEY_AUTO_INTERCEPT] = it }
            remote.factNotificationsEnabled?.let { prefs[KEY_FACT_NOTIFICATIONS_ENABLED] = it }
            remote.triggerMode?.let { prefs[KEY_TRIGGER_MODE] = it }
            remote.everyNTracks?.let { prefs[KEY_EVERY_N_TRACKS] = it.coerceAtLeast(1) }
            remote.sameTrackStoryEveryN?.let {
                prefs[KEY_SAME_TRACK_STORY_EVERY_N] = it.coerceIn(1, 20)
            }
            remote.specificArtists?.let { prefs[KEY_SPECIFIC_ARTISTS] = it.toSet() }
            remote.specificGenres?.let { prefs[KEY_SPECIFIC_GENRES] = it.toSet() }
            remote.storyLength?.let { prefs[KEY_STORY_LENGTH] = it }
            remote.storyNarrator?.let { prefs[KEY_STORY_NARRATOR] = it }
            remote.ttsVoice?.let { prefs[KEY_TTS_VOICE] = it }
            remote.ttsSpeed?.let { prefs[KEY_TTS_SPEED] = it }
            remote.ttsEmotion?.let { prefs[KEY_TTS_EMOTION] = it }
            remote.ttsPlaybackEngine?.let { prefs[KEY_TTS_PLAYBACK_ENGINE] = it }
            remote.serverTtsProvider?.let { prefs[KEY_SERVER_TTS_PROVIDER] = it }
            remote.speakTrackNamesInVoiceover?.let { prefs[KEY_SPEAK_TRACK_NAMES_IN_VOICEOVER] = it }
            remote.llmProvider?.let { prefs[KEY_LLM_PROVIDER] = it }
            remote.appLanguage?.let {
                prefs[KEY_APP_LANGUAGE] = it
                LocaleHelper.persistLanguageForBoot(context, AppLanguage.fromId(it))
            }
            prefs[KEY_SETTINGS_SYNCED_AT] = remoteAt
        }
        StoryLog.i("SETTINGS cloud pull applied updatedAt=$remoteAt")
        return true
    }

    suspend fun markSettingsSynced(updatedAt: Long = System.currentTimeMillis()) {
        context.settingsDataStore.edit { it[KEY_SETTINGS_SYNCED_AT] = updatedAt }
    }

    val trialExpiredUpsellShown: Flow<Boolean> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_TRIAL_EXPIRED_UPSELL_SHOWN] ?: false
    }

    suspend fun setTrialExpiredUpsellShown(shown: Boolean = true) {
        context.settingsDataStore.edit { it[KEY_TRIAL_EXPIRED_UPSELL_SHOWN] = shown }
    }

    val trialBannerDismissedMilestones: Flow<Set<Int>> = context.settingsDataStore.data.map { prefs ->
        prefs[KEY_TRIAL_BANNER_DISMISSED]?.split(',')
            ?.mapNotNull { it.trim().toIntOrNull() }
            ?.toSet()
            ?: emptySet()
    }

    suspend fun dismissTrialBannerMilestone(milestoneDays: Int) {
        context.settingsDataStore.edit { prefs ->
            val current = prefs[KEY_TRIAL_BANNER_DISMISSED]?.split(',')
                ?.mapNotNull { it.trim().toIntOrNull() }
                ?.toMutableSet()
                ?: mutableSetOf()
            current.add(milestoneDays)
            prefs[KEY_TRIAL_BANNER_DISMISSED] = current.sorted().joinToString(",")
        }
    }

    companion object {
        const val DEFAULT_BACKEND_URL = "https://music-story-production.up.railway.app"
        const val DEFAULT_EVERY_N_TRACKS = 3
        const val DEFAULT_SAME_TRACK_STORY_EVERY_N = 3
        const val DEFAULT_AUTO_INTERCEPT = true
        const val DEFAULT_FACT_NOTIFICATIONS_ENABLED = true
        const val DEFAULT_SPEAK_TRACK_NAMES_IN_VOICEOVER = true
        const val DEFAULT_MUSIC_FADE_SECONDS = 1.5f
        const val DEFAULT_COUNT_TRACK_LISTEN_SECONDS = 10
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
        private val KEY_HOME_TOUR_PENDING = booleanPreferencesKey("home_tour_pending")
        private val KEY_HOME_TOUR_COMPLETED = booleanPreferencesKey("home_tour_completed")
        private val KEY_ACCOUNT_LOGIN_GATE_COMPLETED = booleanPreferencesKey("account_login_gate_completed")
        private val KEY_SUPPRESS_AUTO_STORY_UNTIL = longPreferencesKey("suppress_auto_story_until")
        private val KEY_BACKEND_URL = stringPreferencesKey("backend_url")
        private val KEY_AUTH_INSTALL_ID = stringPreferencesKey("auth_install_id")
        private val KEY_AUTH_ACCESS_TOKEN = stringPreferencesKey("auth_access_token")
        private val KEY_AUTH_EXPIRES_AT = longPreferencesKey("auth_expires_at")
        private val KEY_SECRETS_TOUCH = longPreferencesKey("secrets_touch")
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
        private val KEY_TTS_PLAYBACK_ENGINE = stringPreferencesKey("tts_playback_engine")
        private val KEY_SILERO_VOICE_PRESET = stringPreferencesKey("silero_voice_preset")
        private val KEY_EDGE_VOICE_PRESET = stringPreferencesKey("edge_voice_preset")
        private val KEY_SPEAK_TRACK_NAMES_IN_VOICEOVER = booleanPreferencesKey("speak_track_names_in_voiceover")
        private val KEY_FACT_NOTIFICATIONS_ENABLED = booleanPreferencesKey("fact_notifications_enabled")
        private val KEY_APP_LANGUAGE = stringPreferencesKey("app_language")
        private val KEY_ELEVENLABS_VOICE = stringPreferencesKey("elevenlabs_voice")
        private val KEY_OFFLINE_AUDIO_CACHE_ENABLED = booleanPreferencesKey("offline_audio_cache_enabled")
        private val KEY_OFFLINE_CACHE_PURGE_VERSION = intPreferencesKey("offline_cache_purge_version")
        private val KEY_OFFLINE_PACK_PHASE = stringPreferencesKey("offline_pack_phase")
        private val KEY_OFFLINE_PACK_SESSION_ID = longPreferencesKey("offline_pack_session_id")
        private val KEY_SERVER_TTS_PROVIDER = stringPreferencesKey("server_tts_provider")
        private val KEY_USER_TTS_BILLING = stringPreferencesKey("user_tts_billing")
        private val KEY_YANDEX_API_KEY = stringPreferencesKey("yandex_api_key")
        private val KEY_YANDEX_FOLDER_ID = stringPreferencesKey("yandex_folder_id")
        private val KEY_SALUTE_AUTH_KEY = stringPreferencesKey("salute_auth_key")
        private val KEY_APP_POWER_MODE = stringPreferencesKey("app_power_mode")
        private val KEY_MONITOR_PAUSED_BY_USER = booleanPreferencesKey("monitor_paused_by_user")
        private val KEY_MUSIC_INTERRUPTION_MODE = stringPreferencesKey("music_interruption_mode")
        private val KEY_MUSIC_FADE_SECONDS = floatPreferencesKey("music_fade_seconds")
        private val KEY_COUNT_TRACK_LISTEN_ENABLED = booleanPreferencesKey("count_track_listen_enabled")
        private val KEY_COUNT_TRACK_LISTEN_SECONDS = intPreferencesKey("count_track_listen_seconds")
        private val KEY_SYNC_CODE = stringPreferencesKey("sync_code")
        private val KEY_ACCOUNT_LINKED = booleanPreferencesKey("account_linked")
        private val KEY_ACCOUNT_EMAIL = stringPreferencesKey("account_email")
        private val KEY_ACCOUNT_ID = stringPreferencesKey("account_id")
        private val KEY_ACCOUNT_PLAN = stringPreferencesKey("account_plan")
        private val KEY_ACCOUNT_TELEGRAM_USERNAME = stringPreferencesKey("account_telegram_username")
        private val KEY_ACCOUNT_TELEGRAM_ID = longPreferencesKey("account_telegram_id")
        private val KEY_ACCOUNT_TRIAL_UNTIL = longPreferencesKey("account_trial_until")
        private val KEY_ACCOUNT_PREMIUM_UNTIL = longPreferencesKey("account_premium_until")
        private val KEY_SETTINGS_SYNCED_AT = longPreferencesKey("settings_synced_at")
        private val KEY_TRIAL_EXPIRED_UPSELL_SHOWN = booleanPreferencesKey("trial_expired_upsell_shown")
        private val KEY_TRIAL_BANNER_DISMISSED = stringPreferencesKey("trial_banner_dismissed_milestones")
        private const val OPENROUTER_FORCE_VERSION = 2
    }
}

data class AuthState(
    val installId: String,
    val accessToken: String,
    val expiresAtMs: Long,
    val secretsTransportKey: String = "",
)
