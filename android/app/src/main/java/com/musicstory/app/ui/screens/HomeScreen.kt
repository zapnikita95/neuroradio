package com.musicstory.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.PowerOff
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.util.BackendUrlRules
import com.musicstory.app.domain.AppPowerMode
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.OrchestratorState
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.TierAccess
import com.musicstory.app.ui.components.GenerationStoryPreview
import com.musicstory.app.ui.components.LivePulseDot
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.SourceBadge
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.ui.tour.SettingsTourSpotlightOverlay
import com.musicstory.app.ui.tour.SettingsTourStep
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenSettings: () -> Unit,
    onOpenHistory: () -> Unit,
    onRequestNotificationAccess: () -> Unit,
    onHomeTourFinishedOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val uiState by app.storyOrchestrator.uiState.collectAsState()
    val hasAccess = app.mediaControllerManager.hasNotificationAccess()
    val isPlaying = app.mediaControllerManager.isPlaying.collectAsState().value
    val powerMode by app.settingsDataStore.appPowerMode.collectAsState(initial = AppPowerMode.ON)
    val storyNarrator by app.settingsDataStore.storyNarrator.collectAsState(initial = StoryNarrator.AUTO)
    val llmProvider by app.settingsDataStore.llmProvider.collectAsState(initial = LlmProvider.GROQ)
    val groqApiKey by app.settingsDataStore.groqApiKey.collectAsState(initial = "")
    val geminiApiKey by app.settingsDataStore.geminiApiKey.collectAsState(initial = "")
    val openRouterApiKey by app.settingsDataStore.openRouterApiKey.collectAsState(initial = "")
    val localOllamaUrl by app.settingsDataStore.localOllamaUrl.collectAsState(initial = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL)
    val homeTourPending by app.settingsDataStore.homeTourPending.collectAsState(initial = false)
    val backendUrl by app.settingsDataStore.backendUrl.collectAsState(initial = SettingsDataStore.DEFAULT_BACKEND_URL)
    val dailyQuota by app.storyRepository.dailyQuota.collectAsState(initial = null)
    val scope = rememberCoroutineScope()

    var tourStep by remember { mutableStateOf<Int?>(null) }
    var tourBoundsByStep by remember { mutableStateOf<Map<Int, Rect>>(emptyMap()) }
    var tourOverlayReady by remember { mutableStateOf(false) }
    val homeScrollState = rememberScrollState()

    val tourSteps = remember(context) {
        listOf(
            SettingsTourStep(
                context.getString(R.string.home_tour_welcome_title),
                context.getString(R.string.home_tour_welcome_body),
            ),
            SettingsTourStep(
                context.getString(R.string.home_tour_track_title),
                context.getString(R.string.home_tour_track_body),
            ),
            SettingsTourStep(
                context.getString(R.string.home_tour_counter_title),
                context.getString(R.string.home_tour_counter_body),
            ),
            SettingsTourStep(
                context.getString(R.string.home_tour_story_btn_title),
                context.getString(R.string.home_tour_story_btn_body),
            ),
            SettingsTourStep(
                context.getString(R.string.home_tour_settings_title),
                context.getString(R.string.home_tour_settings_body),
            ),
            SettingsTourStep(
                context.getString(R.string.home_tour_history_title),
                context.getString(R.string.home_tour_history_body),
            ),
        )
    }

    LaunchedEffect(homeTourPending) {
        if (homeTourPending) tourStep = 0
    }

    fun recordTourBounds(stepIndex: Int, coords: LayoutCoordinates) {
        tourBoundsByStep = tourBoundsByStep + (stepIndex to coords.boundsInRoot())
    }

    LaunchedEffect(tourStep) {
        tourOverlayReady = false
        val step = tourStep ?: return@LaunchedEffect
        if (step == 0) {
            tourOverlayReady = true
            return@LaunchedEffect
        }
        kotlinx.coroutines.delay(220)
        tourOverlayReady = true
    }

    val tourActive = tourStep != null

    val hasOwnProviderKey = when (llmProvider) {
        LlmProvider.GROQ -> groqApiKey.isNotBlank()
        LlmProvider.GEMINI -> geminiApiKey.isNotBlank()
        LlmProvider.OPENROUTER -> openRouterApiKey.isNotBlank()
        LlmProvider.LOCAL -> localOllamaUrl.isNotBlank()
    }
    val canUseServerStories = when (llmProvider) {
        LlmProvider.LOCAL -> BackendUrlRules.isLanBackend(backendUrl) && localOllamaUrl.isNotBlank()
        else -> backendUrl.trim().isNotBlank()
    }
    val showMissingKeyBanner = !hasOwnProviderKey && !canUseServerStories
    val showManualStoryButton = TierAccess.canShowManualStoryButton(
        hasPersonalApiKey = hasOwnProviderKey,
        tier = dailyQuota?.tier,
    )

    DisposableEffect(Unit) {
        onDispose {
            app.storyOrchestrator.onHomeHidden()
        }
    }

    LaunchedEffect(Unit) {
        app.storyOrchestrator.recoverStaleUi()
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { _ ->
        if (hasAccess) {
            app.monitorLifecycle.ensureListening()
        }
    }

    LaunchedEffect(hasAccess, powerMode) {
        if (!hasAccess) {
            app.storyOrchestrator.setServiceRunning(false)
            return@LaunchedEffect
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                return@LaunchedEffect
            }
        }
        when (powerMode) {
            AppPowerMode.OFF -> app.storyOrchestrator.setServiceRunning(false)
            AppPowerMode.PARSE_ONLY, AppPowerMode.ON -> app.monitorLifecycle.ensureListening()
        }
    }

    if (!hasAccess) {
        LaunchedEffect(Unit) {
            onRequestNotificationAccess()
        }
        return
    }

    val isListening = hasAccess && powerMode != AppPowerMode.OFF
    val isSpinning = isListening &&
        uiState.currentTrack != null &&
        (
            isPlaying ||
                uiState.state == OrchestratorState.PREPARING_PLAYBACK ||
                uiState.state == OrchestratorState.PLAYING_STORY
            )

    MusicStoryBackground(modifier = modifier) {
        Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Music Story",
                            style = MaterialTheme.typography.labelMedium,
                            color = GoldBright,
                        )
                        Text(
                            text = context.getString(R.string.home_title),
                            style = MaterialTheme.typography.titleLarge,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DeepVoid.copy(alpha = 0.65f),
                    titleContentColor = CreamText,
                ),
                actions = {
                    PowerModeToggle(
                        mode = powerMode,
                        onClick = { scope.launch { app.monitorLifecycle.cycleAppPowerMode() } },
                        tourActive = tourActive,
                    )
                    IconButton(
                        onClick = onOpenHistory,
                        enabled = !tourActive,
                        modifier = Modifier.onGloballyPositioned { coords ->
                            recordTourBounds(5, coords)
                        },
                    ) {
                        Icon(
                            Icons.Default.History,
                            contentDescription = context.getString(R.string.nav_history),
                            tint = GoldBright,
                        )
                    }
                    IconButton(
                        onClick = onOpenSettings,
                        enabled = !tourActive,
                        modifier = Modifier.onGloballyPositioned { coords ->
                            recordTourBounds(4, coords)
                        },
                    ) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = context.getString(R.string.nav_settings),
                            tint = GoldBright,
                        )
                    }
                },
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(homeScrollState, enabled = !tourActive)
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Top,
            ) {
                Spacer(modifier = Modifier.height(8.dp))

                VinylDisc(
                    isSpinning = isSpinning,
                    size = 172.dp,
                )

                Spacer(modifier = Modifier.height(10.dp))

                ServiceStatusRow(
                    hasAccess = hasAccess,
                    powerMode = powerMode,
                    notificationVisible = uiState.isServiceRunning,
                )

                Spacer(modifier = Modifier.height(28.dp))

                NowPlayingSection(
                    artist = uiState.currentTrack?.artist,
                    title = uiState.currentTrack?.title,
                    packageName = uiState.currentTrack?.packageName,
                    modifier = Modifier.onGloballyPositioned { coords ->
                        recordTourBounds(1, coords)
                    },
                )

                Spacer(modifier = Modifier.height(20.dp))

                OrchestratorStatusLine(
                    narratorLabel = storyNarrator.labelRu,
                    state = uiState.state,
                    isBackendFetching = uiState.isBackendFetching,
                    tracksUntilNext = when {
                        powerMode != AppPowerMode.ON -> null
                        uiState.state == OrchestratorState.PREPARING_PLAYBACK ||
                            uiState.state == OrchestratorState.PLAYING_STORY -> null
                        else -> uiState.tracksUntilNext
                    },
                    modifier = Modifier.onGloballyPositioned { coords ->
                        recordTourBounds(2, coords)
                    },
                )

                if (uiState.isBackendFetching) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = GoldBright,
                            strokeWidth = 2.dp,
                        )
                        Text(
                            text = context.getString(R.string.state_fetching),
                            modifier = Modifier.padding(start = 12.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedLavender,
                        )
                    }
                }

                if (powerMode == AppPowerMode.PARSE_ONLY && isListening) {
                    Spacer(modifier = Modifier.height(12.dp))
                    HintBanner(message = context.getString(R.string.hint_power_mode_parse_only))
                }

                if (showMissingKeyBanner && isListening && powerMode == AppPowerMode.ON) {
                    Spacer(modifier = Modifier.height(12.dp))
                    HintBanner(message = context.getString(R.string.hint_api_key_missing_banner))
                }

                if (uiState.state == OrchestratorState.PREPARING_PLAYBACK) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = GoldBright,
                            strokeWidth = 2.dp,
                        )
                        Text(
                            text = context.getString(R.string.state_preparing),
                            modifier = Modifier.padding(start = 12.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedLavender,
                        )
                    }
                }

                if (!uiState.hintMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    HintBanner(message = uiState.hintMessage!!)
                }

                if (!uiState.errorMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    ErrorBanner(message = uiState.errorMessage!!)
                }

                if (uiState.generationPreview.isActive && uiState.generationPreview.words.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    GenerationStoryPreview(
                        preview = uiState.generationPreview,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp)
                    .onGloballyPositioned { coords ->
                        recordTourBounds(3, coords)
                    },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (!hasAccess) {
                    SecondaryStoryButton(
                        text = context.getString(R.string.action_grant_access),
                        onClick = onRequestNotificationAccess,
                    )
                }

                if (showManualStoryButton) {
                    PrimaryStoryButton(
                        text = context.getString(R.string.action_manual_story),
                        onClick = { app.storyOrchestrator.requestManualStory() },
                        enabled = !tourActive &&
                            powerMode != AppPowerMode.OFF &&
                            uiState.canRequestManualStory &&
                            !uiState.isBackendFetching,
                    )
                }

                if (uiState.isGenerationActive) {
                    SecondaryStoryButton(
                        text = if (uiState.state == OrchestratorState.PLAYING_STORY) {
                            context.getString(R.string.action_stop_story)
                        } else {
                            context.getString(R.string.action_cancel_generation)
                        },
                        onClick = { app.storyOrchestrator.cancelGeneration() },
                    )
                }
            }
        }

            if (tourOverlayReady) {
                tourStep?.let { step ->
                    SettingsTourSpotlightOverlay(
                        highlightRect = if (step == 0) null else tourBoundsByStep[step],
                        stepIndex = step,
                        steps = tourSteps,
                        centerTooltipWhenNoHighlight = step == 0,
                        visible = true,
                        onControlsBottomChanged = {},
                        onNext = {
                            tourOverlayReady = false
                            if (step >= tourSteps.lastIndex) {
                                tourStep = null
                                scope.launch { app.settingsDataStore.setHomeTourCompleted(true) }
                                onHomeTourFinishedOpenSettings()
                            } else {
                                tourStep = step + 1
                            }
                        },
                        onSkip = {
                            tourStep = null
                            tourOverlayReady = false
                            scope.launch { app.settingsDataStore.setHomeTourCompleted(true) }
                        },
                    )
                }
            }

            uiState.pendingFeedback?.let { feedback ->
                StoryFeedbackSheet(
                    feedback = feedback,
                    onDismiss = { app.storyOrchestrator.clearFeedbackPrompt() },
                    modifier = Modifier.align(Alignment.BottomCenter),
                )
            }
        }
    }
}

@Composable
private fun PowerModeToggle(
    mode: AppPowerMode,
    onClick: () -> Unit,
    tourActive: Boolean = false,
) {
    val context = LocalContext.current
    val (icon, labelRes, tint) = when (mode) {
        AppPowerMode.ON -> Triple(Icons.Default.Power, R.string.power_mode_on, LiveGreen)
        AppPowerMode.PARSE_ONLY -> Triple(Icons.Default.Headphones, R.string.power_mode_parse, GoldBright)
        AppPowerMode.OFF -> Triple(Icons.Default.PowerOff, R.string.power_mode_off, MutedLavender)
    }
    IconButton(onClick = onClick, enabled = !tourActive) {
        Icon(
            imageVector = icon,
            contentDescription = context.getString(labelRes),
            tint = tint,
            modifier = Modifier.size(26.dp),
        )
    }
}

@Composable
private fun ServiceStatusRow(
    hasAccess: Boolean,
    powerMode: AppPowerMode,
    notificationVisible: Boolean,
) {
    val context = LocalContext.current
    val isListening = hasAccess && powerMode != AppPowerMode.OFF
    val dotColor = when {
        !hasAccess -> ErrorCoral
        powerMode == AppPowerMode.OFF -> MutedLavender
        powerMode == AppPowerMode.PARSE_ONLY -> GoldBright
        notificationVisible -> LiveGreen
        isListening -> GoldBright
        else -> MutedLavender
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        LivePulseDot(color = dotColor, active = isListening && notificationVisible)
        Column(modifier = Modifier.padding(start = 10.dp)) {
            Text(
                text = when {
                    !hasAccess -> context.getString(R.string.status_no_access)
                    powerMode == AppPowerMode.OFF -> context.getString(R.string.status_power_off)
                    powerMode == AppPowerMode.PARSE_ONLY -> context.getString(R.string.status_power_parse_only)
                    notificationVisible -> context.getString(R.string.status_monitoring)
                    isListening -> context.getString(R.string.status_waiting_music)
                    else -> context.getString(R.string.status_stopped)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = CreamText,
            )
            when {
                powerMode == AppPowerMode.OFF && hasAccess -> {
                    Text(
                        text = context.getString(R.string.status_power_off_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                }
                powerMode == AppPowerMode.PARSE_ONLY && hasAccess -> {
                    Text(
                        text = context.getString(R.string.status_power_parse_only_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                }
                isListening && !notificationVisible -> {
                    Text(
                        text = context.getString(R.string.status_waiting_music_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                }
            }
        }
    }
}

@Composable
private fun NowPlayingSection(
    artist: String?,
    title: String?,
    packageName: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = title ?: context.getString(R.string.label_no_track),
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (!artist.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = artist,
                style = MaterialTheme.typography.titleMedium,
                color = GoldBright,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!packageName.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            SourceBadge(packageName = packageName)
        }
    }
}

@Composable
private fun OrchestratorStatusLine(
    narratorLabel: String,
    state: OrchestratorState,
    isBackendFetching: Boolean,
    tracksUntilNext: Int?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val stateLabel = when {
        isBackendFetching -> null
        state == OrchestratorState.PREPARING_PLAYBACK -> null
        else -> orchestratorStateLabel(context, state)
    }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = narratorLabel,
            style = MaterialTheme.typography.labelLarge,
            color = MutedLavender,
        )
        if (stateLabel != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stateLabel,
                style = MaterialTheme.typography.bodyLarge,
                color = if (state == OrchestratorState.ERROR) ErrorCoral else CreamText,
            )
        }
        if (tracksUntilNext != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = context.getString(R.string.label_tracks_until_story, tracksUntilNext),
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun HintBanner(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = GoldBright.copy(alpha = 0.10f),
                shape = RoundedCornerShape(14.dp),
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MutedLavender,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = ErrorCoral.copy(alpha = 0.12f),
                shape = RoundedCornerShape(14.dp),
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = ErrorCoral,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

private fun orchestratorStateLabel(context: android.content.Context, state: OrchestratorState): String {
    return when (state) {
        OrchestratorState.IDLE -> context.getString(R.string.state_idle)
        OrchestratorState.LISTENING -> context.getString(R.string.state_listening)
        OrchestratorState.FETCHING_STORY -> context.getString(R.string.state_fetching)
        OrchestratorState.PREPARING_PLAYBACK -> context.getString(R.string.state_preparing)
        OrchestratorState.PLAYING_STORY -> context.getString(R.string.state_playing)
        OrchestratorState.ERROR -> context.getString(R.string.state_error)
    }
}
