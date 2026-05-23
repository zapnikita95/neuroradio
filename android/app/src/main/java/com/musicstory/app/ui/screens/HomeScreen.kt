package com.musicstory.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import com.musicstory.app.service.MediaMonitorService
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

    DisposableEffect(Unit) {
        onDispose {
            app.storyOrchestrator.onHomeHidden()
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { _ ->
        if (hasAccess) {
            MediaMonitorService.start(context)
            app.storyOrchestrator.setServiceRunning(true)
        }
    }

    LaunchedEffect(hasAccess) {
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
        MediaMonitorService.start(context)
        app.storyOrchestrator.setServiceRunning(true)
    }

    val isSpinning = hasAccess &&
        uiState.isServiceRunning &&
        uiState.currentTrack != null &&
        (
            isPlaying ||
                uiState.state == OrchestratorState.FETCHING_STORY ||
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
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                VinylDisc(
                    isSpinning = isSpinning,
                    size = 196.dp,
                )

                Spacer(modifier = Modifier.height(14.dp))

                ServiceStatusRow(
                    isRunning = uiState.isServiceRunning,
                    hasAccess = hasAccess,
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

                if (uiState.state == OrchestratorState.FETCHING_STORY) {
                    Spacer(modifier = Modifier.height(16.dp))
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

                if (!uiState.errorMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    ErrorBanner(message = uiState.errorMessage!!)
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

                PrimaryStoryButton(
                    text = context.getString(R.string.action_manual_story),
                    onClick = { app.storyOrchestrator.requestManualStory() },
                    enabled = uiState.state != OrchestratorState.FETCHING_STORY &&
                        uiState.state != OrchestratorState.PLAYING_STORY,
                )

                if (uiState.state == OrchestratorState.PLAYING_STORY) {
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
    isRunning: Boolean,
    hasAccess: Boolean,
) {
    val context = LocalContext.current
    val dotColor = when {
        !hasAccess -> ErrorCoral
        isRunning -> LiveGreen
        else -> MutedLavender
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        LivePulseDot(color = dotColor, active = hasAccess && isRunning)
        Text(
            text = when {
                !hasAccess -> context.getString(R.string.status_no_access)
                isRunning -> context.getString(R.string.status_monitoring)
                else -> context.getString(R.string.status_stopped)
            },
            modifier = Modifier.padding(start = 10.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = CreamText,
        )
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
        OrchestratorState.FETCHING_STORY -> null
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
        OrchestratorState.PLAYING_STORY -> context.getString(R.string.state_playing)
        OrchestratorState.ERROR -> context.getString(R.string.state_error)
    }
}
