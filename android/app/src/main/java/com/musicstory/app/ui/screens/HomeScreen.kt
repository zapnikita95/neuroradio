package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.domain.OrchestratorMode
import com.musicstory.app.domain.OrchestratorState
import com.musicstory.app.service.MediaMonitorService
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.LivePulseDot
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.SectionLabel
import com.musicstory.app.ui.components.SourceBadge
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import androidx.compose.ui.platform.LocalContext

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
                        Icon(Icons.Default.History, contentDescription = context.getString(R.string.nav_history), tint = GoldBright)
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = context.getString(R.string.nav_settings), tint = GoldBright)
                    }
                },
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Spacer(modifier = Modifier.height(4.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    VinylDisc(
                        isSpinning = isPlaying && uiState.currentTrack != null,
                        size = 168.dp,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    ServiceStatusRow(
                        isRunning = uiState.isServiceRunning,
                        hasAccess = hasAccess,
                    )
                }

                NowPlayingCard(
                    artist = uiState.currentTrack?.artist,
                    title = uiState.currentTrack?.title,
                    album = uiState.currentTrack?.album,
                    packageName = uiState.currentTrack?.packageName,
                )

                OrchestratorStatusCard(
                    mode = uiState.mode,
                    state = uiState.state,
                    tracksUntilNext = uiState.tracksUntilNext,
                    errorMessage = uiState.errorMessage,
                )

                uiState.lastStory?.let { story ->
                    StoryPreviewCard(
                        artist = story.artist,
                        title = story.title,
                        script = story.script,
                        year = story.year,
                        genre = story.genre,
                        isAi = !story.demo,
                    )
                }

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
private fun NowPlayingCard(
    artist: String?,
    title: String?,
    album: String?,
    packageName: String?,
) {
    val context = LocalContext.current
    GlassCard(accentBorder = title != null) {
        SectionLabel(text = context.getString(R.string.label_now_playing))
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = title ?: context.getString(R.string.label_no_track),
            style = MaterialTheme.typography.headlineSmall,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (!artist.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = artist,
                style = MaterialTheme.typography.titleMedium,
                color = GoldBright,
            )
        }
        if (!album.isNullOrBlank()) {
            Text(text = album, style = MaterialTheme.typography.bodyMedium)
        }
        if (!packageName.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(10.dp))
            SourceBadge(packageName = packageName)
        }
    }
}

@Composable
private fun OrchestratorStatusCard(
    mode: OrchestratorMode,
    state: OrchestratorState,
    tracksUntilNext: Int?,
    errorMessage: String?,
) {
    val context = LocalContext.current
    GlassCard {
        SectionLabel(text = context.getString(R.string.label_orchestrator))
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = when (mode) {
                OrchestratorMode.AUTO -> context.getString(R.string.mode_auto)
                OrchestratorMode.MANUAL -> context.getString(R.string.mode_manual)
            },
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = orchestratorStateLabel(context, state),
            style = MaterialTheme.typography.bodyMedium,
        )
        if (tracksUntilNext != null) {
            Text(
                text = context.getString(R.string.label_tracks_until_story, tracksUntilNext),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (state == OrchestratorState.FETCHING_STORY) {
            Spacer(modifier = Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = GoldBright, strokeWidth = 2.dp)
                Text(
                    text = context.getString(R.string.state_fetching),
                    modifier = Modifier.padding(start = 12.dp),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        if (!errorMessage.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = errorMessage, color = ErrorCoral, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun StoryPreviewCard(
    artist: String,
    title: String,
    script: String,
    year: Int?,
    genre: String?,
    isAi: Boolean,
) {
    val context = LocalContext.current
    GlassCard(accentBorder = true) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SectionLabel(text = context.getString(R.string.label_last_story))
            if (isAi) {
                Text(
                    text = context.getString(R.string.story_source_ai),
                    style = MaterialTheme.typography.labelMedium,
                    color = LiveGreen,
                )
            }
        }
        Spacer(modifier = Modifier.height(10.dp))
        Text(text = "$artist — $title", style = MaterialTheme.typography.titleMedium)
        val meta = listOfNotNull(year?.toString(), genre).joinToString(" · ")
        if (meta.isNotBlank()) {
            Text(text = meta, style = MaterialTheme.typography.labelMedium)
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "«$script»",
            style = MaterialTheme.typography.bodyLarge.copy(
                color = CreamText,
                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
            ),
            maxLines = 8,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Start,
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
