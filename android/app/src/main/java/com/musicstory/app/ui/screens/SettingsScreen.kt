package com.musicstory.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.musicstory.app.BuildConfig
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.util.StoryLog
import com.musicstory.app.util.ApiKeySanitizer
import com.musicstory.app.util.BackendUrlRules
import com.musicstory.app.R
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.remote.ConnectionCheckResult
import com.musicstory.app.data.remote.BillingEntitlementResponse
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.GroqModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.OpenRouterModel
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.SileroVoicePreset
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsPlaybackEngine
import com.musicstory.app.ui.components.TrialCountdownBanner
import com.musicstory.app.ui.components.TrialUi
import com.musicstory.app.domain.UserTtsBilling
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.domain.TierAccess
import com.musicstory.app.domain.TriggerMode
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.ScrobblePickList
import com.musicstory.app.ui.components.SectionLabel
import com.musicstory.app.ui.tour.SettingsTourSpotlightOverlay
import com.musicstory.app.ui.tour.SettingsTourStep
import com.musicstory.app.ui.tour.settingsTourHighlight
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.ui.theme.SurfaceGlass
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.abs
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenAccountLogin: () -> Unit = {},
    onOpenAccount: () -> Unit = onOpenAccountLogin,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val scope = rememberCoroutineScope()
    val settings = app.settingsDataStore

    DisposableEffect(Unit) {
        onDispose {
            scope.launch { app.syncSettingsWithServer() }
        }
    }

    val manualMode by settings.manualMode.collectAsState(initial = false)
    val autoIntercept by settings.autoIntercept.collectAsState(initial = SettingsDataStore.DEFAULT_AUTO_INTERCEPT)
    val everyN by settings.everyNTracks.collectAsState(initial = SettingsDataStore.DEFAULT_EVERY_N_TRACKS)
    val groqApiKey by settings.groqApiKey.collectAsState(initial = "")
    val geminiApiKey by settings.geminiApiKey.collectAsState(initial = "")
    val openRouterApiKey by settings.openRouterApiKey.collectAsState(initial = "")
    val localOllamaUrl by settings.localOllamaUrl.collectAsState(initial = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL)
    val localOllamaModel by settings.localOllamaModel.collectAsState(initial = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL)
    val backendUrl by settings.backendUrl.collectAsState(initial = SettingsDataStore.DEFAULT_BACKEND_URL)
    val llmProvider by settings.llmProvider.collectAsState(initial = LlmProvider.GROQ)
    val geminiModel by settings.geminiModel.collectAsState(initial = GeminiModel.defaultRecommended)
    val groqModel by settings.groqModel.collectAsState(initial = GroqModel.defaultRecommended)
    val groqCustomModelId by settings.groqCustomModelId.collectAsState(initial = "")
    val openRouterModel by settings.openRouterModel.collectAsState(initial = OpenRouterModel.defaultRecommended)
    val openRouterCustomModelId by settings.openRouterCustomModelId.collectAsState(initial = "")
    val sameTrackEveryN by settings.sameTrackStoryEveryN.collectAsState(
        initial = SettingsDataStore.DEFAULT_SAME_TRACK_STORY_EVERY_N,
    )
    val triggerMode by settings.triggerMode.collectAsState(initial = TriggerMode.EVERY_N_TRACKS)
    val specificArtists by settings.specificArtists.collectAsState(initial = emptySet())
    val specificGenres by settings.specificGenres.collectAsState(initial = emptySet())
    val scrobbledArtists by app.scrobbleRepository.topArtists().collectAsState(initial = emptyList())
    val scrobbledGenres by app.scrobbleRepository.topGenres().collectAsState(initial = emptyList())
    val dailyQuota by app.storyRepository.dailyQuota.collectAsState(initial = null)
    val storyLength by settings.storyLength.collectAsState(initial = StoryLength.SEC_60)
    val storyNarrator by settings.storyNarrator.collectAsState(initial = StoryNarrator.AUTO)
    val ttsVoice by settings.ttsVoice.collectAsState(initial = TtsVoice.AUTO)
    val ttsSpeed by settings.ttsSpeed.collectAsState(initial = TtsSpeed.NORMAL)
    val ttsEmotion by settings.ttsEmotion.collectAsState(initial = TtsEmotion.LIVELY)
    val ttsPlaybackEngine by settings.ttsPlaybackEngine.collectAsState(initial = TtsPlaybackEngine.YANDEX_SERVER)
    val sileroVoicePreset by settings.sileroVoicePreset.collectAsState(initial = SileroVoicePreset.CALM_FEMALE)
    val userTtsBilling by settings.userTtsBilling.collectAsState(initial = UserTtsBilling.SERVER)
    val yandexApiKey by settings.yandexApiKey.collectAsState(initial = "")
    val yandexFolderId by settings.yandexFolderId.collectAsState(initial = "")
    val musicFadeSeconds by settings.musicFadeSeconds.collectAsState(initial = SettingsDataStore.DEFAULT_MUSIC_FADE_SECONDS)
    val countTrackListenEnabled by settings.countTrackAfterListenEnabled.collectAsState(initial = false)
    val countTrackListenSeconds by settings.countTrackAfterListenSeconds.collectAsState(
        initial = SettingsDataStore.DEFAULT_COUNT_TRACK_LISTEN_SECONDS,
    )
    val tourPending by settings.settingsTourPending.collectAsState(initial = false)

    var tourStep by remember { mutableStateOf<Int?>(null) }
    var tourTargetBounds by remember { mutableStateOf<Rect?>(null) }
    var tourSectionCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var tourOverlayReady by remember { mutableStateOf(false) }
    val density = LocalDensity.current
    val screenHeightPx = with(density) { LocalConfiguration.current.screenHeightDp.dp.toPx() }
    val tourSteps = remember {
        listOf(
            SettingsTourStep(context.getString(R.string.tour_step_mode_title), context.getString(R.string.tour_step_mode_body)),
            SettingsTourStep(context.getString(R.string.tour_step_trigger_title), context.getString(R.string.tour_step_trigger_body)),
            SettingsTourStep(context.getString(R.string.tour_step_same_track_title), context.getString(R.string.tour_step_same_track_body)),
            SettingsTourStep(context.getString(R.string.tour_step_narrator_title), context.getString(R.string.tour_step_narrator_body)),
            SettingsTourStep(context.getString(R.string.tour_step_voice_title), context.getString(R.string.tour_step_voice_body)),
            SettingsTourStep(context.getString(R.string.tour_step_music_title), context.getString(R.string.tour_step_music_body)),
            SettingsTourStep(context.getString(R.string.tour_step_ai_title), context.getString(R.string.tour_step_ai_body)),
        )
    }
    val scrollState = rememberScrollState()

    fun updateTourBounds(coords: LayoutCoordinates) {
        tourSectionCoords = coords
        tourTargetBounds = coords.boundsInRoot()
    }

    suspend fun centerTourSection(coords: LayoutCoordinates) {
        val rect = coords.boundsInRoot()
        val safeTop = with(density) { 76.dp.toPx() }
        val safeBottom = screenHeightPx - with(density) { 300.dp.toPx() }
        val targetCenter = (safeTop + safeBottom) / 2f
        val delta = rect.center.y - targetCenter
        if (abs(delta) > 2f) {
            scrollState.animateScrollBy(delta)
            delay(320)
            tourSectionCoords?.let { updateTourBounds(it) }
        }
    }

    LaunchedEffect(tourPending) {
        if (tourPending) tourStep = 0
    }

    LaunchedEffect(tourStep) {
        tourOverlayReady = false
        tourTargetBounds = null
        if (tourStep == null) {
            tourSectionCoords = null
            return@LaunchedEffect
        }
        tourSectionCoords = null
        delay(280)
        repeat(12) { attempt ->
            val coords = tourSectionCoords
            if (coords != null) {
                centerTourSection(coords)
                updateTourBounds(coords)
                if (tourTargetBounds != null && tourTargetBounds!!.height >= 4f) {
                    tourOverlayReady = true
                    return@LaunchedEffect
                }
            }
            delay(if (attempt == 0) 80L else 120L)
        }
        tourSectionCoords?.let { updateTourBounds(it) }
        tourOverlayReady = true
    }

    fun tourLayoutHandler(stepIndex: Int): ((LayoutCoordinates) -> Unit)? {
        if (tourStep != stepIndex) return null
        return { coords ->
            tourSectionCoords = coords
        }
    }

    var groqInput by remember(groqApiKey) { mutableStateOf(groqApiKey) }
    var yandexKeyInput by remember(yandexApiKey) { mutableStateOf(yandexApiKey) }
    var yandexFolderInput by remember(yandexFolderId) { mutableStateOf(yandexFolderId) }
    var userTtsSaveFeedback by remember { mutableStateOf<String?>(null) }
    var geminiInput by remember(geminiApiKey) { mutableStateOf(geminiApiKey) }
    var openRouterInput by remember(openRouterApiKey) { mutableStateOf(openRouterApiKey) }
    var localUrlInput by remember(localOllamaUrl) { mutableStateOf(localOllamaUrl) }
    var localModelInput by remember(localOllamaModel) { mutableStateOf(localOllamaModel) }
    var localBackendUrlInput by remember(llmProvider) {
        mutableStateOf(
            if (llmProvider == LlmProvider.LOCAL) {
                if (BackendUrlRules.isLanBackend(backendUrl)) backendUrl
                else SettingsDataStore.SUGGESTED_LOCAL_BACKEND_URL
            } else {
                ""
            },
        )
    }
    var groqCustomInput by remember(groqCustomModelId) { mutableStateOf(groqCustomModelId) }
    var openRouterCustomInput by remember(openRouterCustomModelId) { mutableStateOf(openRouterCustomModelId) }
    var nInput by remember(everyN) { mutableStateOf(everyN.toString()) }
    var sameTrackInput by remember(sameTrackEveryN) { mutableStateOf(sameTrackEveryN.toString()) }
    var musicFadeInput by remember(musicFadeSeconds) {
        mutableStateOf(
            if (musicFadeSeconds % 1f == 0f) {
                musicFadeSeconds.toInt().toString()
            } else {
                String.format(Locale.US, "%.1f", musicFadeSeconds)
            },
        )
    }
    var countListenEnabledUi by remember(countTrackListenEnabled) { mutableStateOf(countTrackListenEnabled) }
    var listenSecondsInput by remember(countTrackListenSeconds) {
        mutableStateOf(countTrackListenSeconds.toString())
    }

    var isChecking by remember { mutableStateOf(false) }
    var checkResult by remember { mutableStateOf<ConnectionCheckResult?>(null) }
    var checkSummary by remember { mutableStateOf<String?>(null) }
    var devTierLabel by remember { mutableStateOf<String?>(null) }
    var devTierFeedback by remember { mutableStateOf<String?>(null) }
    var billingEntitlement by remember { mutableStateOf<BillingEntitlementResponse?>(null) }
    val trialExpiredUpsellShown by settings.trialExpiredUpsellShown.collectAsState(initial = false)
    val trialBannerDismissed by settings.trialBannerDismissedMilestones.collectAsState(initial = emptySet())
    var showTrialExpiredDialog by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var saveFeedback by remember { mutableStateOf<String?>(null) }

    val activeApiKey = when (llmProvider) {
        LlmProvider.GROQ -> groqApiKey
        LlmProvider.GEMINI -> geminiApiKey
        LlmProvider.OPENROUTER -> openRouterApiKey
        LlmProvider.LOCAL -> if (
            BackendUrlRules.isLanBackend(localBackendUrlInput.trim()) &&
            localOllamaUrl.isNotBlank()
        ) {
            localOllamaUrl
        } else {
            ""
        }
    }
    val activeApiInput = when (llmProvider) {
        LlmProvider.GROQ -> groqInput
        LlmProvider.GEMINI -> geminiInput
        LlmProvider.OPENROUTER -> openRouterInput
        LlmProvider.LOCAL -> localUrlInput
    }
    val effectiveTier = devTierLabel ?: dailyQuota?.tier
    val trialUntil = billingEntitlement?.trialUntil
    var trialTick by remember { mutableIntStateOf(0) }
    LaunchedEffect(trialUntil) {
        if (trialUntil == null || trialUntil <= System.currentTimeMillis()) return@LaunchedEffect
        while (true) {
            delay(30_000)
            trialTick++
        }
    }
    val trialRemainingMs = remember(trialUntil, trialTick) { TrialUi.remainingMs(trialUntil) }
    val showTrialBanner = TrialUi.shouldShowTrialBanner(trialRemainingMs, trialBannerDismissed)
    val trialExpired = TrialUi.isTrialExpired(trialUntil, effectiveTier)

    LaunchedEffect(trialExpired, trialExpiredUpsellShown) {
        if (trialExpired && !trialExpiredUpsellShown) {
            showTrialExpiredDialog = true
        }
    }

    if (showTrialExpiredDialog) {
        AlertDialog(
            onDismissRequest = {
                showTrialExpiredDialog = false
                scope.launch { settings.setTrialExpiredUpsellShown(true) }
            },
            title = { Text(context.getString(R.string.trial_expired_title)) },
            text = { Text(context.getString(R.string.trial_expired_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showTrialExpiredDialog = false
                    scope.launch { settings.setTrialExpiredUpsellShown(true) }
                    onOpenAccount()
                }) {
                    Text(context.getString(R.string.trial_expired_subscribe))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showTrialExpiredDialog = false
                    scope.launch { settings.setTrialExpiredUpsellShown(true) }
                }) {
                    Text(context.getString(R.string.trial_expired_later))
                }
            },
        )
    }

    val hasPersonalKey = activeApiKey.isNotBlank()
    val canCustomizeEveryN = TierAccess.canCustomizeEveryNTracks(effectiveTier)

    val hasPendingChanges = remember(
        groqInput,
        groqApiKey,
        geminiInput,
        geminiApiKey,
        openRouterInput,
        openRouterApiKey,
        localUrlInput,
        localOllamaUrl,
        localBackendUrlInput,
        backendUrl,
        localModelInput,
        localOllamaModel,
        llmProvider,
        nInput,
        everyN,
        sameTrackInput,
        sameTrackEveryN,
        triggerMode,
        musicFadeInput,
        musicFadeSeconds,
        countListenEnabledUi,
        countTrackListenEnabled,
        listenSecondsInput,
        countTrackListenSeconds,
        canCustomizeEveryN,
    ) {
        ApiKeySanitizer.clean(groqInput) != ApiKeySanitizer.clean(groqApiKey) ||
            ApiKeySanitizer.clean(geminiInput) != ApiKeySanitizer.clean(geminiApiKey) ||
            ApiKeySanitizer.clean(openRouterInput) != ApiKeySanitizer.clean(openRouterApiKey) ||
            localUrlInput.trim().trimEnd('/') != localOllamaUrl.trim().trimEnd('/') ||
            (llmProvider == LlmProvider.LOCAL &&
                localBackendUrlInput.trim().trimEnd('/') != backendUrl.trim().trimEnd('/')) ||
            localModelInput.trim() != localOllamaModel.trim() ||
            sameTrackInput.toIntOrNull() != sameTrackEveryN ||
            musicFadeInput.toFloatOrNull()?.coerceIn(0.5f, 8f) != musicFadeSeconds ||
            countListenEnabledUi != countTrackListenEnabled ||
            listenSecondsInput.toIntOrNull()?.coerceIn(5, 300) != countTrackListenSeconds ||
            (triggerMode == TriggerMode.EVERY_N_TRACKS && canCustomizeEveryN && nInput.toIntOrNull() != everyN)
    }

    LaunchedEffect(activeApiInput, llmProvider) {
        checkSummary = null
        checkResult = null
    }

    LaunchedEffect(backendUrl) {
        val url = backendUrl.trim().trimEnd('/')
        if (url.isBlank()) return@LaunchedEffect
        app.storyRepository.refreshQuota()
        runCatching {
            val status = app.apiClient.fetchBillingStatus(url)
            billingEntitlement = status.entitlement
            if (status.devTierSwitchEnabled == true) {
                devTierLabel = status.devTierOverride ?: status.tier
            } else {
                devTierLabel = status.tier
            }
        }
    }

    val canManualMode = TierAccess.canUseManualMode(hasPersonalKey, effectiveTier)
    val canAdvancedTriggers = TierAccess.canUseAdvancedTriggers(effectiveTier)
    val canCustomizeFade = TierAccess.canCustomizeMusicFadeSeconds(effectiveTier)
    val canCustomizeListen = TierAccess.canCustomizeListenThresholdSeconds(effectiveTier)
    val isPaidServerTier = TierAccess.isPremiumLike(effectiveTier) && !hasPersonalKey
    val isFreeServerTier = TierAccess.isFreeServerTier(effectiveTier) && !hasPersonalKey
    val serverUsesSilero = ttsPlaybackEngine == TtsPlaybackEngine.YANDEX_SERVER &&
        userTtsBilling == UserTtsBilling.SERVER &&
        isFreeServerTier
    val showSileroVoices = serverUsesSilero
    val showYandexVoices = ttsPlaybackEngine == TtsPlaybackEngine.YANDEX_SERVER &&
        !serverUsesSilero &&
        (userTtsBilling == UserTtsBilling.YANDEX || (userTtsBilling == UserTtsBilling.SERVER && isPaidServerTier))
    val userTtsBillingOptions = remember {
        UserTtsBilling.entries.filter { it != UserTtsBilling.SBER }
    }

    LaunchedEffect(userTtsBilling) {
        if (userTtsBilling == UserTtsBilling.SBER) {
            settings.setUserTtsBilling(UserTtsBilling.SERVER)
        }
    }

    LaunchedEffect(canManualMode, manualMode) {
        if (!canManualMode && manualMode) settings.setManualMode(false)
    }
    LaunchedEffect(canAdvancedTriggers, triggerMode) {
        if (!canAdvancedTriggers && triggerMode != TriggerMode.EVERY_N_TRACKS) {
            settings.setTriggerMode(TriggerMode.EVERY_N_TRACKS)
        }
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = GoldBright,
        unfocusedBorderColor = GoldWarm.copy(alpha = 0.35f),
        focusedLabelColor = GoldBright,
        cursorColor = GoldBright,
        focusedTextColor = CreamText,
        unfocusedTextColor = CreamText,
    )

    MusicStoryBackground(modifier = modifier) {
        Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text(context.getString(R.string.settings_title), style = MaterialTheme.typography.titleLarge) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = context.getString(R.string.action_back), tint = GoldBright)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DeepVoid.copy(alpha = 0.65f)),
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState, enabled = tourStep == null)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val modeSummary = if (manualMode) {
                    context.getString(R.string.mode_manual)
                } else {
                    context.getString(R.string.mode_auto)
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_mode_section),
                    summary = modeSummary,
                    tourHighlight = tourStep == 0,
                    forceExpanded = tourStep == 0,
                    tourActive = tourStep == 0,
                    onTourLayout = tourLayoutHandler(0),
                ) {
                    SettingSwitchRow(
                        title = context.getString(R.string.settings_manual_mode),
                        checked = manualMode,
                        enabled = canManualMode,
                        onCheckedChange = { scope.launch { settings.setManualMode(it) } },
                    )
                    if (!canManualMode) {
                        Text(
                            text = context.getString(R.string.settings_premium_locked_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                    }
                    SettingSwitchRow(
                        title = context.getString(R.string.settings_auto_intercept),
                        checked = autoIntercept,
                        onCheckedChange = { scope.launch { settings.setAutoIntercept(it) } },
                    )
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_trigger_mode),
                    summary = buildTriggerSummary(
                        context = context,
                        triggerMode = triggerMode,
                        specificArtists = specificArtists,
                        specificGenres = specificGenres,
                    ),
                    initiallyExpanded = triggerMode == TriggerMode.SPECIFIC_ARTISTS ||
                        triggerMode == TriggerMode.SPECIFIC_GENRES,
                    tourHighlight = tourStep == 1,
                    forceExpanded = tourStep == 1,
                    tourActive = tourStep == 1,
                    onTourLayout = tourLayoutHandler(1),
                ) {
                    TriggerMode.entries.forEach { mode ->
                        val modeEnabled = canAdvancedTriggers
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = triggerMode == mode,
                                onClick = {
                                    if (modeEnabled) scope.launch { settings.setTriggerMode(mode) }
                                },
                                enabled = modeEnabled,
                                colors = RadioButtonDefaults.colors(selectedColor = GoldBright),
                            )
                            Text(
                                text = triggerModeLabel(context, mode),
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (modeEnabled) CreamText else MutedLavender.copy(alpha = 0.5f),
                            )
                        }
                    }
                    if (!canAdvancedTriggers) {
                        Text(
                            text = context.getString(R.string.settings_premium_locked_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    if (triggerMode == TriggerMode.EVERY_N_TRACKS) {
                        Spacer(modifier = Modifier.height(8.dp))
                        if (canCustomizeEveryN) {
                            OutlinedTextField(
                                value = nInput,
                                onValueChange = { nInput = it.filter { ch -> ch.isDigit() }.take(3) },
                                label = { Text(context.getString(R.string.settings_every_n_tracks)) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                        } else {
                            Text(
                                text = context.getString(R.string.settings_every_n_tracks) + ": $everyN",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MutedLavender,
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Switch(
                                checked = countListenEnabledUi,
                                onCheckedChange = { countListenEnabledUi = it },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = GoldBright,
                                    checkedTrackColor = GoldWarm.copy(alpha = 0.5f),
                                ),
                            )
                            Text(
                                text = context.getString(R.string.settings_count_listen_enabled),
                                style = MaterialTheme.typography.bodyMedium,
                                color = CreamText,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                        Text(
                            text = when {
                                !countListenEnabledUi ->
                                    context.getString(R.string.settings_count_listen_hint_off)
                                canCustomizeListen ->
                                    context.getString(R.string.settings_count_listen_hint_premium)
                                else -> context.getString(R.string.settings_count_listen_hint_free)
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        if (countListenEnabledUi && canCustomizeListen) {
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = listenSecondsInput,
                                onValueChange = { listenSecondsInput = it.filter { ch -> ch.isDigit() }.take(3) },
                                label = { Text(context.getString(R.string.settings_count_listen_seconds)) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                        }
                    }
                    if (triggerMode == TriggerMode.SPECIFIC_ARTISTS) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_pick_artists),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        ScrobblePickList(
                            items = scrobbledArtists.map { it.artist },
                            selected = specificArtists,
                            emptyHint = context.getString(R.string.settings_pick_empty_artists),
                            onToggle = { artist ->
                                scope.launch {
                                    val current = settings.specificArtists.first()
                                    val next = if (current.any { it.equals(artist, ignoreCase = true) }) {
                                        current.filterNot { it.equals(artist, ignoreCase = true) }.toSet()
                                    } else {
                                        current + artist
                                    }
                                    settings.setSpecificArtists(next)
                                }
                            },
                            subtitleFor = { artist ->
                                val stat = scrobbledArtists.find { it.artist == artist }
                                stat?.let { context.getString(R.string.listening_play_count, it.playCount) }
                            },
                        )
                    }
                    if (triggerMode == TriggerMode.SPECIFIC_GENRES) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_pick_genres),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        ScrobblePickList(
                            items = scrobbledGenres.map { it.genre },
                            selected = specificGenres,
                            emptyHint = context.getString(R.string.settings_pick_empty_genres),
                            onToggle = { genre ->
                                scope.launch {
                                    val current = settings.specificGenres.first()
                                    val next = if (current.any { it.equals(genre, ignoreCase = true) }) {
                                        current.filterNot { it.equals(genre, ignoreCase = true) }.toSet()
                                    } else {
                                        current + genre
                                    }
                                    settings.setSpecificGenres(next)
                                }
                            },
                            subtitleFor = { genre ->
                                val stat = scrobbledGenres.find { it.genre == genre }
                                stat?.let { context.getString(R.string.listening_play_count, it.playCount) }
                            },
                        )
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_same_track_section),
                    summary = context.getString(R.string.settings_same_track_every_n) + ": $sameTrackEveryN",
                    tourHighlight = tourStep == 2,
                    forceExpanded = tourStep == 2,
                    tourActive = tourStep == 2,
                    onTourLayout = tourLayoutHandler(2),
                ) {
                    if (canAdvancedTriggers) {
                        OutlinedTextField(
                            value = sameTrackInput,
                            onValueChange = { sameTrackInput = it.filter { ch -> ch.isDigit() }.take(2) },
                            label = { Text(context.getString(R.string.settings_same_track_every_n)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                    } else {
                        Text(
                            text = context.getString(R.string.settings_premium_locked_hint),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedLavender,
                        )
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_narrator_section),
                    summary = storyNarrator.labelRu,
                    tourHighlight = tourStep == 3,
                    forceExpanded = tourStep == 3,
                    tourActive = tourStep == 3,
                    onTourLayout = tourLayoutHandler(3),
                ) {
                    StoryNarrator.entries.forEach { narrator ->
                        NarratorRadioRow(
                            label = narrator.labelRu,
                            description = narrator.descriptionRu,
                            selected = storyNarrator == narrator,
                            onSelect = { scope.launch { settings.setStoryNarrator(narrator) } },
                        )
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_voice_section),
                    summary = when (ttsPlaybackEngine) {
                        TtsPlaybackEngine.ANDROID_DEVICE ->
                            "${ttsPlaybackEngine.labelRu} · ${ttsSpeed.labelRu} · ${storyLength.labelRu}"
                        TtsPlaybackEngine.YANDEX_SERVER ->
                            when {
                                showSileroVoices ->
                                    "${sileroVoicePreset.labelRu} · ${ttsSpeed.labelRu} · ${storyLength.labelRu}"
                                else ->
                                    "${ttsVoice.labelRu} · ${ttsSpeed.labelRu} · ${storyLength.labelRu}"
                            }.let { voices ->
                                "${TtsPlaybackEngine.YANDEX_SERVER.labelForTier(effectiveTier)} · $voices"
                            }
                    },
                    tourHighlight = tourStep == 4,
                    forceExpanded = tourStep == 4,
                    tourActive = tourStep == 4,
                    onTourLayout = tourLayoutHandler(4),
                ) {
                    trialRemainingMs?.let { remaining ->
                        if (showTrialBanner) {
                            TrialCountdownBanner(
                                remainingMs = remaining,
                                onDismiss = {
                                    TrialUi.bannerMilestoneDays(remaining)?.let { milestone ->
                                        scope.launch { settings.dismissTrialBannerMilestone(milestone) }
                                    }
                                },
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
                    Text(
                        text = context.getString(R.string.settings_tts_playback_engine),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    Text(
                        text = if (TierAccess.isPremiumLike(effectiveTier)) {
                            context.getString(R.string.settings_tts_playback_engine_hint_premium)
                        } else {
                            context.getString(R.string.settings_tts_playback_engine_hint)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    TtsPlaybackEngine.entries.forEach { engine ->
                        NarratorRadioRow(
                            label = engine.labelForTier(effectiveTier),
                            description = engine.descriptionForTier(effectiveTier),
                            selected = ttsPlaybackEngine == engine,
                            onSelect = { scope.launch { settings.setTtsPlaybackEngine(engine) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    if (showSileroVoices) {
                        Text(
                            text = context.getString(R.string.settings_silero_voice),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        SileroVoicePreset.entries.forEach { preset ->
                            NarratorRadioRow(
                                label = preset.labelRu,
                                description = preset.descriptionRu,
                                selected = sileroVoicePreset == preset,
                                onSelect = { scope.launch { settings.setSileroVoicePreset(preset) } },
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    if (showYandexVoices) {
                    Text(
                        text = context.getString(R.string.settings_tts_voice),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    TtsVoice.entries.forEach { voice ->
                        NarratorRadioRow(
                            label = voice.labelRu,
                            description = voice.descriptionRu,
                            selected = ttsVoice == voice,
                            onSelect = { scope.launch { settings.setTtsVoice(voice) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = context.getString(R.string.settings_tts_emotion),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    TtsEmotion.entries.forEach { emotion ->
                        NarratorRadioRow(
                            label = emotion.labelRu,
                            description = emotion.descriptionRu,
                            selected = ttsEmotion == emotion,
                            onSelect = { scope.launch { settings.setTtsEmotion(emotion) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    }
                    Text(
                        text = context.getString(R.string.settings_tts_speed),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    TtsSpeed.entries.forEach { speed ->
                        PreferenceRadioRow(
                            label = speed.labelRu,
                            selected = ttsSpeed == speed,
                            onSelect = { scope.launch { settings.setTtsSpeed(speed) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = context.getString(R.string.settings_story_length),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    StoryLength.entries.forEach { length ->
                        PreferenceRadioRow(
                            label = length.labelRu,
                            selected = storyLength == length,
                            onSelect = { scope.launch { settings.setStoryLength(length) } },
                        )
                    }
                    if (ttsPlaybackEngine == TtsPlaybackEngine.YANDEX_SERVER) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_user_tts_section),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        Text(
                            text = context.getString(R.string.settings_user_tts_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                            modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                        )
                        userTtsBillingOptions.forEach { billing ->
                            NarratorRadioRow(
                                label = billing.labelRu,
                                description = billing.descriptionRu,
                                selected = userTtsBilling == billing,
                                onSelect = {
                                    userTtsSaveFeedback = null
                                    scope.launch { settings.setUserTtsBilling(billing) }
                                },
                            )
                        }
                        if (userTtsBilling != UserTtsBilling.SERVER) {
                            Text(
                                text = context.getString(
                                    R.string.settings_user_tts_active,
                                    userTtsBilling.labelRu,
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                color = GoldBright,
                                modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
                            )
                        }
                        if (userTtsBilling == UserTtsBilling.YANDEX) {
                            OutlinedTextField(
                                value = yandexKeyInput,
                                onValueChange = { yandexKeyInput = it; userTtsSaveFeedback = null },
                                label = { Text(context.getString(R.string.settings_yandex_api_key)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = yandexFolderInput,
                                onValueChange = { yandexFolderInput = it; userTtsSaveFeedback = null },
                                label = { Text(context.getString(R.string.settings_yandex_folder_id)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                            Text(
                                text = context.getString(R.string.settings_yandex_tts_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = MutedLavender,
                                modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
                            )
                            Text(
                                text = context.getString(R.string.settings_yandex_get_key),
                                style = MaterialTheme.typography.bodySmall,
                                color = GoldBright,
                                modifier = Modifier
                                    .padding(bottom = 8.dp)
                                    .clickable {
                                        context.startActivity(
                                            Intent(
                                                Intent.ACTION_VIEW,
                                                Uri.parse("https://yandex.cloud/ru/docs/speechkit/quickstart"),
                                            ),
                                        )
                                    },
                            )
                        }
                        if (userTtsBilling != UserTtsBilling.SERVER) {
                            SecondaryStoryButton(
                                text = context.getString(R.string.settings_user_tts_save),
                                onClick = {
                                    scope.launch {
                                        settings.setYandexApiKey(ApiKeySanitizer.clean(yandexKeyInput))
                                        settings.setYandexFolderId(yandexFolderInput.trim())
                                        yandexKeyInput = ApiKeySanitizer.clean(yandexKeyInput)
                                        userTtsSaveFeedback = context.getString(R.string.settings_user_tts_saved)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            userTtsSaveFeedback?.let { msg ->
                                Text(
                                    text = msg,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = GoldBright,
                                    modifier = Modifier.padding(top = 6.dp),
                                )
                            }
                        }
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_music_interrupt_section),
                    tourHighlight = tourStep == 5,
                    forceExpanded = tourStep == 5,
                    tourActive = tourStep == 5,
                    onTourLayout = tourLayoutHandler(5),
                    summary = "${context.getString(R.string.settings_music_interrupt_fade)} · ${musicFadeSeconds}s",
                ) {
                    Text(
                        text = context.getString(R.string.settings_music_interrupt_fade),
                        style = MaterialTheme.typography.bodyMedium,
                        color = CreamText,
                    )
                    Text(
                        text = context.getString(R.string.settings_music_fade_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    if (canCustomizeFade) {
                        OutlinedTextField(
                            value = musicFadeInput,
                            onValueChange = { input ->
                                val normalized = input
                                    .replace(',', '.')
                                    .filterIndexed { index, ch ->
                                        ch.isDigit() || (ch == '.' && !input.take(index).contains('.'))
                                    }
                                    .take(4)
                                musicFadeInput = normalized
                            },
                            label = { Text(context.getString(R.string.settings_music_fade_seconds)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                    } else {
                        Text(
                            text = context.getString(
                                R.string.settings_music_fade_fixed_hint,
                                SettingsDataStore.DEFAULT_MUSIC_FADE_SECONDS,
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                    }
                }

                val aiSummary = when {
                    hasPersonalKey -> context.getString(R.string.settings_ai_own_key_active)
                    isPaidServerTier -> context.getString(
                        R.string.settings_server_llm_premium,
                        OpenRouterModel.DEEPSEEK_V3.labelRu,
                    )
                    isFreeServerTier -> {
                        val quotaLabel = dailyQuota?.let { formatServerQuotaLabel(context, it) }.orEmpty()
                        val modelLabel = OpenRouterModel.defaultFreeServer.labelRu
                        if (quotaLabel.isNotBlank()) "$modelLabel · $quotaLabel" else modelLabel
                    }
                    dailyQuota != null -> formatServerQuotaLabel(context, dailyQuota!!)
                    else -> context.getString(R.string.settings_groq_status_missing)
                }
                val advancedAiSummary = context.getString(
                    R.string.settings_ai_advanced_summary,
                    llmProvider.labelRu,
                    if (activeApiKey.isNotBlank()) {
                        context.getString(R.string.settings_groq_status_ok)
                    } else {
                        context.getString(R.string.settings_groq_status_missing)
                    },
                )

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_ai_section),
                    summary = aiSummary,
                    initiallyExpanded = true,
                    tourHighlight = tourStep == 6,
                    forceExpanded = tourStep == 6,
                    tourActive = tourStep == 6,
                    onTourLayout = tourLayoutHandler(6),
                ) {
                    if (hasPersonalKey) {
                        Text(
                            text = context.getString(R.string.settings_ai_own_key_active),
                            style = MaterialTheme.typography.bodySmall,
                            color = LiveGreen,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }

                    if (isPaidServerTier) {
                        Text(
                            text = context.getString(R.string.settings_ai_server_section),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = context.getString(
                                R.string.settings_server_llm_premium,
                                OpenRouterModel.DEEPSEEK_V3.labelRu,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = CreamText,
                        )
                        Text(
                            text = context.getString(R.string.settings_server_llm_premium_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                            modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                        )
                    }

                    if (isFreeServerTier) {
                        Text(
                            text = context.getString(R.string.settings_ai_server_section),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = context.getString(
                                R.string.settings_server_llm_free,
                                OpenRouterModel.defaultFreeServer.labelRu,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = CreamText,
                        )
                        Text(
                            text = context.getString(R.string.settings_server_llm_free_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                            modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                        )
                    }

                    if (!hasPersonalKey) {
                        dailyQuota?.let { quota ->
                            Text(
                                text = formatServerQuotaLabel(context, quota),
                                style = MaterialTheme.typography.labelMedium,
                                color = GoldBright,
                            )
                        }
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_ai_advanced_collapsible),
                    summary = advancedAiSummary,
                    initiallyExpanded = false,
                ) {
                    var providerMenuExpanded by remember { mutableStateOf(false) }
                    var geminiModelMenuExpanded by remember { mutableStateOf(false) }
                    var groqModelMenuExpanded by remember { mutableStateOf(false) }
                    var openRouterModelMenuExpanded by remember { mutableStateOf(false) }

                    Text(
                        text = context.getString(R.string.settings_llm_provider_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    ExposedDropdownMenuBox(
                        expanded = providerMenuExpanded,
                        onExpandedChange = { providerMenuExpanded = it },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        OutlinedTextField(
                            value = llmProvider.labelRu,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(context.getString(R.string.settings_llm_provider)) },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = providerMenuExpanded)
                            },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                        DropdownMenu(
                            expanded = providerMenuExpanded,
                            onDismissRequest = { providerMenuExpanded = false },
                        ) {
                            LlmProvider.entries.forEach { provider ->
                                DropdownMenuItem(
                                    text = { Text(provider.labelRu, color = CreamText) },
                                    onClick = {
                                        providerMenuExpanded = false
                                        scope.launch {
                                            StoryLog.i(
                                                "SETTINGS UI: user tapped LLM provider -> ${provider.labelRu} (${provider.id})",
                                            )
                                            settings.setLlmProvider(provider)
                                            if (provider == LlmProvider.LOCAL) {
                                                val saved = settings.backendUrl.first()
                                                localBackendUrlInput = if (BackendUrlRules.isLanBackend(saved)) {
                                                    saved
                                                } else {
                                                    SettingsDataStore.SUGGESTED_LOCAL_BACKEND_URL
                                                }
                                            }
                                        }
                                    },
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = context.getString(R.string.settings_llm_active, llmProvider.labelRu),
                        style = MaterialTheme.typography.labelMedium,
                        color = GoldBright,
                    )
                    if (llmProvider == LlmProvider.OPENROUTER) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_openrouter_model_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = openRouterModelMenuExpanded,
                            onExpandedChange = { openRouterModelMenuExpanded = it },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            OutlinedTextField(
                                value = openRouterModel.settingsLabelRu,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(context.getString(R.string.settings_openrouter_model)) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = openRouterModelMenuExpanded)
                                },
                                modifier = Modifier.menuAnchor().fillMaxWidth(),
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                            DropdownMenu(
                                expanded = openRouterModelMenuExpanded,
                                onDismissRequest = { openRouterModelMenuExpanded = false },
                            ) {
                                val settingsPresets = OpenRouterModel.entries.filter {
                                    it != OpenRouterModel.CUSTOM &&
                                        it != OpenRouterModel.NEMOTRON_NANO &&
                                        it != OpenRouterModel.GEMMA_4_26B_FREE &&
                                        it != OpenRouterModel.LIQUID_LFM
                                }
                                settingsPresets.forEach { model ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(model.settingsLabelRu, color = CreamText)
                                                Text(
                                                    model.descriptionRu,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MutedLavender,
                                                )
                                            }
                                        },
                                        onClick = {
                                            openRouterModelMenuExpanded = false
                                            scope.launch { settings.setOpenRouterModel(model) }
                                        },
                                    )
                                }
                            }
                        }
                        if (openRouterModel == OpenRouterModel.CUSTOM) {
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = openRouterCustomInput,
                                onValueChange = { openRouterCustomInput = it },
                                label = { Text(context.getString(R.string.settings_openrouter_custom_model)) },
                                placeholder = { Text(context.getString(R.string.settings_openrouter_custom_hint)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                        }
                    }
                    if (llmProvider == LlmProvider.GROQ) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_groq_model_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = groqModelMenuExpanded,
                            onExpandedChange = { groqModelMenuExpanded = it },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            OutlinedTextField(
                                value = groqModel.settingsLabelRu,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(context.getString(R.string.settings_groq_model)) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = groqModelMenuExpanded)
                                },
                                modifier = Modifier.menuAnchor().fillMaxWidth(),
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                            DropdownMenu(
                                expanded = groqModelMenuExpanded,
                                onDismissRequest = { groqModelMenuExpanded = false },
                            ) {
                                GroqModel.entries.forEach { model ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(model.settingsLabelRu, color = CreamText)
                                                Text(
                                                    model.descriptionRu,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MutedLavender,
                                                )
                                            }
                                        },
                                        onClick = {
                                            groqModelMenuExpanded = false
                                            scope.launch { settings.setGroqModel(model) }
                                        },
                                    )
                                }
                            }
                        }
                        if (groqModel == GroqModel.CUSTOM) {
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = groqCustomInput,
                                onValueChange = { groqCustomInput = it },
                                label = { Text(context.getString(R.string.settings_groq_custom_model)) },
                                placeholder = { Text(context.getString(R.string.settings_groq_custom_hint)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                        }
                    }
                    if (llmProvider == LlmProvider.GEMINI) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_gemini_model_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = geminiModelMenuExpanded,
                            onExpandedChange = { geminiModelMenuExpanded = it },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            OutlinedTextField(
                                value = geminiModel.settingsLabelRu,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(context.getString(R.string.settings_gemini_model)) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = geminiModelMenuExpanded)
                                },
                                modifier = Modifier
                                    .menuAnchor()
                                    .fillMaxWidth(),
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                            DropdownMenu(
                                expanded = geminiModelMenuExpanded,
                                onDismissRequest = { geminiModelMenuExpanded = false },
                            ) {
                                GeminiModel.entries.forEach { model ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(model.settingsLabelRu, color = CreamText)
                                                Text(
                                                    model.descriptionRu,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MutedLavender,
                                                )
                                            }
                                        },
                                        onClick = {
                                            geminiModelMenuExpanded = false
                                            scope.launch { settings.setGeminiModel(model) }
                                        },
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = context.getString(
                                R.string.settings_gemini_paid_models,
                                GeminiModel.paidReferences.joinToString(", ") { it.labelRu },
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Text(
                            text = context.getString(R.string.settings_gemini_pricing_link),
                            style = MaterialTheme.typography.labelMedium,
                            color = GoldBright,
                            modifier = Modifier
                                .padding(top = 4.dp)
                                .clickable {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW, Uri.parse("https://ai.google.dev/pricing")),
                                    )
                                },
                        )
                    }
                    if (llmProvider == LlmProvider.LOCAL) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_local_backend_url_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = localBackendUrlInput,
                            onValueChange = { localBackendUrlInput = it },
                            label = { Text(context.getString(R.string.settings_local_backend_url)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_local_ollama_url_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = localUrlInput,
                            onValueChange = { localUrlInput = it },
                            label = { Text(context.getString(R.string.settings_local_ollama_url)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = localModelInput,
                            onValueChange = { localModelInput = it },
                            label = { Text(context.getString(R.string.settings_local_ollama_model)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                        Text(
                            text = context.getString(R.string.settings_local_ollama_model_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (activeApiKey.isNotBlank()) {
                            if (llmProvider == LlmProvider.LOCAL) {
                                context.getString(R.string.settings_local_status_ok)
                            } else {
                                context.getString(R.string.settings_groq_status_ok)
                            }
                        } else {
                            context.getString(R.string.settings_groq_status_missing)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (activeApiKey.isNotBlank()) LiveGreen else MutedLavender,
                    )
                    if (activeApiKey.isNotBlank() && llmProvider != LlmProvider.LOCAL) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = context.getString(R.string.settings_own_api_key_hint),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                    }
                    if (activeApiKey.isBlank()) {
                        dailyQuota?.let { quota ->
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = formatServerQuotaLabel(context, quota),
                                style = MaterialTheme.typography.labelMedium,
                                color = GoldBright,
                            )
                        }
                    }
                    if (llmProvider != LlmProvider.LOCAL) {
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = activeApiInput,
                        onValueChange = { value ->
                            when (llmProvider) {
                                LlmProvider.GROQ -> groqInput = value
                                LlmProvider.GEMINI -> geminiInput = value
                                LlmProvider.OPENROUTER -> openRouterInput = value
                                LlmProvider.LOCAL -> localUrlInput = value
                            }
                        },
                        label = { Text(context.getString(R.string.settings_api_key)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                        trailingIcon = {
                            if (activeApiInput.isNotEmpty()) {
                                IconButton(
                                    onClick = {
                                        when (llmProvider) {
                                            LlmProvider.GROQ -> groqInput = ""
                                            LlmProvider.GEMINI -> geminiInput = ""
                                            LlmProvider.OPENROUTER -> openRouterInput = ""
                                            LlmProvider.LOCAL -> localUrlInput = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL
                                        }
                                        checkSummary = null
                                        checkResult = null
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Clear,
                                        contentDescription = context.getString(R.string.settings_api_key_clear),
                                        tint = MutedLavender,
                                    )
                                }
                            }
                        },
                    )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    PrimaryStoryButton(
                        text = if (isChecking) {
                            context.getString(R.string.settings_groq_checking)
                        } else {
                            context.getString(R.string.settings_groq_save_test)
                        },
                        loading = isChecking,
                        enabled = !isChecking,
                        onClick = {
                            scope.launch {
                                isChecking = true
                                checkResult = null
                                checkSummary = null
                                try {
                                    val cleanGroq = ApiKeySanitizer.clean(groqInput)
                                    val cleanGemini = ApiKeySanitizer.clean(geminiInput)
                                    val cleanOpenRouter = ApiKeySanitizer.clean(openRouterInput)
                                    var cleanLocalBackend = localBackendUrlInput.trim().trimEnd('/')
                                    val cleanLocalUrl = localUrlInput.trim().trimEnd('/')
                                    val cleanLocalModel = localModelInput.trim()
                                    val inferredBackendFromLocal = if (llmProvider == LlmProvider.LOCAL) {
                                        BackendUrlRules.backendFromMistypedOllamaUrl(cleanLocalUrl)
                                            ?: BackendUrlRules.backendFromMistypedOllamaUrl(cleanLocalBackend)
                                    } else {
                                        null
                                    }
                                    groqInput = cleanGroq
                                    geminiInput = cleanGemini
                                    openRouterInput = cleanOpenRouter
                                    localUrlInput =
                                        if (inferredBackendFromLocal != null) {
                                            SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL
                                        } else {
                                            cleanLocalUrl.ifBlank { SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL }
                                        }
                                    localModelInput = cleanLocalModel.ifBlank { SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL }
                                    settings.setGroqApiKey(cleanGroq)
                                    settings.setGeminiApiKey(cleanGemini)
                                    settings.setOpenRouterApiKey(cleanOpenRouter)
                                    if (llmProvider == LlmProvider.LOCAL) {
                                        if (inferredBackendFromLocal != null) {
                                            cleanLocalBackend = inferredBackendFromLocal
                                            localUrlInput = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL
                                            settings.setLocalOllamaUrl(localUrlInput)
                                            StoryLog.w("SETTINGS auto-fix: moved :3000 URL to backend_url")
                                        }
                                        if (!BackendUrlRules.isLanBackend(cleanLocalBackend)) {
                                            checkSummary =
                                                "Укажи URL сервера ПК (http://IP:3000 из start-local-bff.bat)"
                                            StoryLog.i("SETTINGS local skipped: backend not LAN ($cleanLocalBackend)")
                                            return@launch
                                        }
                                        localBackendUrlInput = cleanLocalBackend
                                        settings.setBackendUrl(cleanLocalBackend)
                                    } else if (inferredBackendFromLocal != null) {
                                        settings.setBackendUrl(inferredBackendFromLocal)
                                        StoryLog.w("SETTINGS auto-fix: moved :3000 URL from Ollama field to backend_url")
                                    }
                                    settings.setLocalOllamaUrl(localUrlInput)
                                    settings.setLocalOllamaModel(localModelInput)
                                    settings.setGroqCustomModelId(groqCustomInput)
                                    settings.setOpenRouterCustomModelId(openRouterCustomInput)

                                    val ready = when (llmProvider) {
                                        LlmProvider.GROQ -> cleanGroq.isNotBlank()
                                        LlmProvider.GEMINI -> cleanGemini.isNotBlank()
                                        LlmProvider.OPENROUTER -> cleanOpenRouter.isNotBlank()
                                        LlmProvider.LOCAL ->
                                            BackendUrlRules.isLanBackend(cleanLocalBackend) &&
                                                localUrlInput.isNotBlank()
                                    }
                                    if (!ready) {
                                        checkSummary =
                                            if (llmProvider == LlmProvider.LOCAL) {
                                                "Укажи URL сервера ПК и Ollama, потом «Сохранить и проверить»"
                                            } else {
                                                "Сначала вставь API-ключ, потом нажми «Сохранить и проверить»"
                                            }
                                        StoryLog.i("SETTINGS API test skipped: not configured for ${llmProvider.id}")
                                        return@launch
                                    }

                                    StoryLog.i("SETTINGS API test start provider=${llmProvider.id}")
                                    val backendUrl = settings.backendUrl.first()
                                    app.backendAuthManager.invalidateToken()
                                    app.apiClient.invalidateCache()
                                    val result = app.storyRepository.checkConnections(
                                        llmProvider = llmProvider,
                                        groqApiKey = cleanGroq,
                                        geminiApiKey = cleanGemini,
                                        openRouterApiKey = cleanOpenRouter,
                                        geminiModel = geminiModel,
                                        groqModel = groqModel,
                                        groqCustomModelId = groqCustomInput,
                                        openRouterModel = openRouterModel,
                                        openRouterCustomModelId = openRouterCustomInput,
                                        backendUrl = backendUrl,
                                        localOllamaUrl = localUrlInput,
                                        localOllamaModel = localModelInput,
                                    )
                                    checkResult = result
                                    checkSummary = when {
                                        result.llmOk == true ->
                                            result.llmMessage ?: context.getString(R.string.settings_groq_test_ok)
                                        result.llmOk == false ->
                                            result.llmMessage ?: context.getString(R.string.settings_groq_test_fail)
                                        result.backendOk ->
                                            result.backendMessage ?: context.getString(R.string.settings_groq_test_ok)
                                        else ->
                                            result.llmMessage ?: result.backendMessage
                                                ?: context.getString(R.string.settings_groq_test_fail)
                                    }
                                } catch (e: Exception) {
                                    StoryLog.e("SETTINGS API test failed: ${e.message}", e)
                                    checkSummary = e.message ?: context.getString(R.string.settings_groq_test_fail)
                                } finally {
                                    isChecking = false
                                }
                            }
                        },
                    )
                    checkSummary?.let { summary ->
                        Spacer(modifier = Modifier.height(8.dp))
                        val checkOk = checkResult?.llmOk == true
                        Text(
                            text = summary,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (checkOk) LiveGreen else ErrorCoral,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    if (llmProvider != LlmProvider.LOCAL) {
                    SecondaryStoryButton(
                        text = when (llmProvider) {
                            LlmProvider.GROQ -> context.getString(R.string.settings_groq_get_key)
                            LlmProvider.GEMINI -> context.getString(R.string.settings_gemini_get_key)
                            LlmProvider.OPENROUTER -> context.getString(R.string.settings_openrouter_get_key)
                            LlmProvider.LOCAL -> ""
                        },
                        onClick = {
                            val url = when (llmProvider) {
                                LlmProvider.GROQ -> "https://console.groq.com/keys"
                                LlmProvider.GEMINI -> "https://aistudio.google.com/apikey"
                                LlmProvider.OPENROUTER -> "https://openrouter.ai/keys"
                                LlmProvider.LOCAL -> ""
                            }
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        },
                    )
                    }
                }

                if (backendUrl.trim().isNotBlank()) {
                    CollapsibleSettingsSection(
                        title = context.getString(R.string.settings_dev_tier_section),
                        summary = devTierLabel ?: dailyQuota?.tier ?: "—",
                        initiallyExpanded = false,
                    ) {
                        Text(
                            text = context.getString(R.string.settings_dev_tier_hint),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        devTierLabel?.let { tier ->
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = context.getString(R.string.settings_dev_tier_current, tier),
                                style = MaterialTheme.typography.labelMedium,
                                color = GoldBright,
                            )
                        }
                        devTierFeedback?.let { msg ->
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = msg,
                                style = MaterialTheme.typography.labelSmall,
                                color = LiveGreen,
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        listOf(
                            null to R.string.settings_dev_tier_reset,
                            "free" to R.string.settings_dev_tier_free,
                            "trial" to R.string.settings_dev_tier_trial,
                            "premium" to R.string.settings_dev_tier_premium,
                        ).forEach { (tierId, labelRes) ->
                            SecondaryStoryButton(
                                text = context.getString(labelRes),
                                onClick = {
                                    scope.launch {
                                        devTierFeedback = null
                                        try {
                                            val resp = app.apiClient.setDevTier(
                                                backendUrl.trim().trimEnd('/'),
                                                tierId,
                                            )
                                            devTierLabel = resp.tier ?: resp.devTierOverride
                                            devTierFeedback = resp.hint ?: resp.error
                                            app.storyRepository.refreshQuota()
                                        } catch (e: Exception) {
                                            devTierFeedback = e.message
                                        }
                                    }
                                },
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                        }
                    }
                }

                PrimaryStoryButton(
                    text = when {
                        isSaving -> context.getString(R.string.settings_saving)
                        saveFeedback != null -> saveFeedback!!
                        else -> context.getString(R.string.action_save)
                    },
                    enabled = hasPendingChanges && !isSaving,
                    onClick = {
                        scope.launch {
                            isSaving = true
                            saveFeedback = null
                            try {
                                nInput.toIntOrNull()?.takeIf { canCustomizeEveryN }?.let { settings.setEveryNTracks(it) }
                                sameTrackInput.toIntOrNull()?.let { settings.setSameTrackStoryEveryN(it) }
                                settings.setCountTrackAfterListenEnabled(countListenEnabledUi)
                                val listenSec = if (countListenEnabledUi) {
                                    if (canCustomizeListen) {
                                        listenSecondsInput.toIntOrNull()?.coerceIn(5, 300)
                                            ?: SettingsDataStore.DEFAULT_COUNT_TRACK_LISTEN_SECONDS
                                    } else {
                                        SettingsDataStore.DEFAULT_COUNT_TRACK_LISTEN_SECONDS
                                    }
                                } else {
                                    listenSecondsInput.toIntOrNull()?.coerceIn(5, 300)
                                        ?: countTrackListenSeconds
                                }
                                settings.setCountTrackAfterListenSeconds(listenSec)
                                if (canCustomizeFade) {
                                    musicFadeInput.toFloatOrNull()?.let { settings.setMusicFadeSeconds(it) }
                                }
                                val cleanGroq = ApiKeySanitizer.clean(groqInput)
                                val cleanGemini = ApiKeySanitizer.clean(geminiInput)
                                val cleanOpenRouter = ApiKeySanitizer.clean(openRouterInput)
                                groqInput = cleanGroq
                                geminiInput = cleanGemini
                                openRouterInput = cleanOpenRouter
                                settings.setGroqApiKey(cleanGroq)
                                settings.setGeminiApiKey(cleanGemini)
                                settings.setOpenRouterApiKey(cleanOpenRouter)
                                settings.setGroqCustomModelId(groqCustomInput)
                                settings.setOpenRouterCustomModelId(openRouterCustomInput)
                                app.triggerEngine.resetCounter()
                                StoryLog.i("SETTINGS saved (no auto API test)")
                                saveFeedback = context.getString(R.string.settings_saved)
                                delay(2500)
                                if (saveFeedback == context.getString(R.string.settings_saved)) {
                                    saveFeedback = null
                                }
                            } catch (e: Exception) {
                                StoryLog.e("SETTINGS save failed: ${e.message}", e)
                                saveFeedback = e.message ?: context.getString(R.string.settings_groq_test_fail)
                            } finally {
                                isSaving = false
                            }
                        }
                    },
                )
            }

                Text(
                    text = context.getString(
                        R.string.settings_app_version,
                        BuildConfig.VERSION_NAME,
                        BuildConfig.VERSION_CODE,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MutedLavender.copy(alpha = 0.65f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, bottom = 24.dp),
                )
        }

            if (tourOverlayReady) {
                tourStep?.let { step ->
                    SettingsTourSpotlightOverlay(
                        highlightRect = tourTargetBounds,
                        stepIndex = step,
                        steps = tourSteps,
                        visible = true,
                        onControlsBottomChanged = {},
                        onNext = {
                            tourOverlayReady = false
                            if (step >= tourSteps.lastIndex) {
                                tourStep = null
                                scope.launch { settings.setSettingsTourCompleted(true) }
                                onBack()
                            } else {
                                tourStep = step + 1
                            }
                        },
                        onSkip = {
                            tourStep = null
                            tourOverlayReady = false
                            scope.launch { settings.setSettingsTourCompleted(true) }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun CollapsibleSettingsSection(
    title: String,
    summary: String,
    initiallyExpanded: Boolean = false,
    tourHighlight: Boolean = false,
    forceExpanded: Boolean = false,
    tourActive: Boolean = false,
    onTourLayout: ((LayoutCoordinates) -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    var expanded by remember { mutableStateOf(initiallyExpanded || forceExpanded) }
    LaunchedEffect(forceExpanded) {
        if (forceExpanded) expanded = true
    }
    var sectionCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }

    GlassCard(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (onTourLayout != null) {
                    Modifier.onGloballyPositioned { coords ->
                        sectionCoords = coords
                        if (tourActive) onTourLayout(coords)
                    }
                } else {
                    Modifier
                },
            ),
        accentBorder = tourHighlight,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = !tourActive) { expanded = !expanded }
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel(text = title)
                if (!expanded) {
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            if (!tourActive) {
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (expanded) {
                        LocalContext.current.getString(R.string.history_collapse)
                    } else {
                        LocalContext.current.getString(R.string.history_expand)
                    },
                    tint = GoldBright,
                )
            }
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
            ) {
                Spacer(modifier = Modifier.height(8.dp))
                content()
            }
        }
    }
}

@Composable
private fun NarratorRadioRow(
    label: String,
    description: String,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(selectedColor = GoldBright),
        )
        Column(modifier = Modifier.padding(top = 12.dp, end = 8.dp)) {
            Text(text = label, style = MaterialTheme.typography.bodyMedium, color = CreamText)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun PreferenceRadioRow(
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(selectedColor = GoldBright),
        )
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = CreamText)
    }
}

@Composable
private fun SettingSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleMedium,
            color = if (enabled) CreamText else MutedLavender.copy(alpha = 0.5f),
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = DeepVoid,
                checkedTrackColor = GoldBright,
                uncheckedTrackColor = SurfaceGlass,
            ),
        )
    }
}

private fun triggerModeLabel(context: android.content.Context, mode: TriggerMode): String {
    return when (mode) {
        TriggerMode.EVERY_N_TRACKS -> context.getString(R.string.trigger_every_n)
        TriggerMode.SPECIFIC_ARTISTS -> context.getString(R.string.trigger_artists)
        TriggerMode.SPECIFIC_GENRES -> context.getString(R.string.trigger_genres)
        TriggerMode.ALWAYS -> context.getString(R.string.trigger_always)
        TriggerMode.NEVER -> context.getString(R.string.trigger_never)
    }
}

private fun buildTriggerSummary(
    context: android.content.Context,
    triggerMode: TriggerMode,
    specificArtists: Set<String>,
    specificGenres: Set<String>,
): String {
    val base = triggerModeLabel(context, triggerMode)
    return when (triggerMode) {
        TriggerMode.SPECIFIC_ARTISTS -> {
            if (specificArtists.isEmpty()) base
            else "$base · ${context.getString(R.string.settings_pick_selected_count, specificArtists.size)}"
        }
        TriggerMode.SPECIFIC_GENRES -> {
            if (specificGenres.isEmpty()) base
            else "$base · ${context.getString(R.string.settings_pick_selected_count, specificGenres.size)}"
        }
        else -> base
    }
}

private fun formatServerQuotaLabel(context: android.content.Context, quota: com.musicstory.app.data.model.StoryQuotaInfo): String {
    if (quota.tier?.lowercase() == "unlimited" || quota.limit >= 999_000) {
        return context.getString(R.string.settings_unlimited_groq)
    }
    val monthlyLimit = quota.monthlyLimit
    if (monthlyLimit != null && monthlyLimit > 0) {
        val monthlyRem = quota.monthlyRemaining
            ?: kotlin.math.max(0, monthlyLimit - (quota.monthlyUsed ?: 0))
        return context.getString(
            R.string.settings_trial_quota,
            monthlyRem,
            monthlyLimit,
            quota.remaining,
            quota.limit,
        )
    }
    return context.getString(R.string.settings_free_quota, quota.remaining, quota.limit)
}
