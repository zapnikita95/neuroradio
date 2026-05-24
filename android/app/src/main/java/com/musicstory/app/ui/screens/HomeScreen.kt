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
import androidx.compose.material.icons.filled.History
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.domain.OrchestratorMode
import com.musicstory.app.domain.OrchestratorState
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
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenSettings: () -> Unit,
    onOpenHistory: () -> Unit,
    onRequestNotificationAccess: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val uiState by app.storyOrchestrator.uiState.collectAsState()
    val hasAccess = app.mediaControllerManager.hasNotificationAccess()
    val isPlaying = app.mediaControllerManager.isPlaying.collectAsState().value
    val monitorPaused by app.settingsDataStore.monitorPausedByUser.collectAsState(initial = false)
    val scope = rememberCoroutineScope()

    DisposableEffect(Unit) {
        onDispose {
            app.storyOrchestrator.onHomeHidden()
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { _ ->
        if (hasAccess) {
            app.monitorLifecycle.ensureListening()
        }
    }

    LaunchedEffect(hasAccess, monitorPaused) {
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
        if (monitorPaused) {
            app.storyOrchestrator.setServiceRunning(false)
            return@LaunchedEffect
        }
        app.monitorLifecycle.ensureListening()
    }

    val isListening = hasAccess && !monitorPaused
    val isSpinning = isListening &&
        uiState.currentTrack != null &&
        (
            isPlaying ||
                uiState.state == OrchestratorState.FETCHING_STORY ||
                uiState.state == OrchestratorState.PREPARING_PLAYBACK ||
                uiState.state == OrchestratorState.PLAYING_STORY
            )

    MusicStoryBackground(modifier = modifier) {
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
                    IconButton(onClick = onOpenHistory) {
                        Icon(
                            Icons.Default.History,
                            contentDescription = context.getString(R.string.nav_history),
                            tint = GoldBright,
                        )
                    }
                    IconButton(onClick = onOpenSettings) {
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
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Top,
            ) {
                Spacer(modifier = Modifier.height(8.dp))

                VinylDisc(
                    isSpinning = isSpinning,
                    size = 196.dp,
                )

                Spacer(modifier = Modifier.height(14.dp))

                ServiceStatusRow(
                    hasAccess = hasAccess,
                    monitorPaused = monitorPaused,
                    notificationVisible = uiState.isServiceRunning,
                )

                Spacer(modifier = Modifier.height(28.dp))

                NowPlayingSection(
                    artist = uiState.currentTrack?.artist,
                    title = uiState.currentTrack?.title,
                    packageName = uiState.currentTrack?.packageName,
                )

                Spacer(modifier = Modifier.height(20.dp))

                OrchestratorStatusLine(
                    mode = uiState.mode,
                    state = uiState.state,
                    tracksUntilNext = uiState.tracksUntilNext,
                )

                if (uiState.state == OrchestratorState.FETCHING_STORY ||
                    uiState.state == OrchestratorState.PREPARING_PLAYBACK
                ) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = GoldBright,
                            strokeWidth = 2.dp,
                        )
                        Text(
                            text = when (uiState.state) {
                                OrchestratorState.PREPARING_PLAYBACK ->
                                    context.getString(R.string.state_preparing)
                                else -> context.getString(R.string.state_fetching)
                            },
                            modifier = Modifier.padding(start = 12.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedLavender,
                        )
                    }
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
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (!hasAccess) {
                    SecondaryStoryButton(
                        text = context.getString(R.string.action_grant_access),
                        onClick = onRequestNotificationAccess,
                    )
                }

                if (hasAccess && monitorPaused && !uiState.isServiceRunning) {
                    SecondaryStoryButton(
                        text = context.getString(R.string.action_resume_monitor),
                        onClick = {
                            scope.launch { app.monitorLifecycle.resume() }
                        },
                    )
                }

                PrimaryStoryButton(
                    text = context.getString(R.string.action_manual_story),
                    onClick = { app.storyOrchestrator.requestManualStory() },
                    enabled = uiState.state != OrchestratorState.FETCHING_STORY &&
                        uiState.state != OrchestratorState.PREPARING_PLAYBACK &&
                        uiState.state != OrchestratorState.PLAYING_STORY,
                )

                if (uiState.state == OrchestratorState.PLAYING_STORY ||
                    uiState.state == OrchestratorState.PREPARING_PLAYBACK
                ) {
                    SecondaryStoryButton(
                        text = context.getString(R.string.action_stop_story),
                        onClick = { app.storyOrchestrator.stopStory() },
                    )
                }
            }
        }
    }
}

@Composable
private fun ServiceStatusRow(
    hasAccess: Boolean,
    monitorPaused: Boolean,
    notificationVisible: Boolean,
) {
    val context = LocalContext.current
    val isListening = hasAccess && !monitorPaused
    val dotColor = when {
        !hasAccess -> ErrorCoral
        monitorPaused -> GoldBright
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
                    monitorPaused -> context.getString(R.string.status_monitoring_paused)
                    notificationVisible -> context.getString(R.string.status_monitoring)
                    isListening -> context.getString(R.string.status_waiting_music)
                    else -> context.getString(R.string.status_stopped)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = CreamText,
            )
            when {
                monitorPaused && hasAccess -> {
                    Text(
                        text = context.getString(R.string.status_monitoring_paused_hint),
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
) {
    val context = LocalContext.current
    Column(
        modifier = Modifier.fillMaxWidth(),
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
    mode: OrchestratorMode,
    state: OrchestratorState,
    tracksUntilNext: Int?,
) {
    val context = LocalContext.current
    val modeLabel = when (mode) {
        OrchestratorMode.AUTO -> context.getString(R.string.mode_auto)
        OrchestratorMode.MANUAL -> context.getString(R.string.mode_manual)
    }
    val stateLabel = when (state) {
        OrchestratorState.FETCHING_STORY,
        OrchestratorState.PREPARING_PLAYBACK,
        -> null
        else -> orchestratorStateLabel(context, state)
    }

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = modeLabel,
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
