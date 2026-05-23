package com.musicstory.app.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.local.ScrobbleEntry
import com.musicstory.app.data.local.StoryHistoryEntry
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.SourceBadge
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class HistoryTab { STORIES, LISTENING }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    var selectedTab by remember { mutableIntStateOf(HistoryTab.STORIES.ordinal) }

    MusicStoryBackground(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text(context.getString(R.string.history_title), style = MaterialTheme.typography.titleLarge) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = context.getString(R.string.action_back), tint = GoldBright)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DeepVoid.copy(alpha = 0.65f)),
            )

            PrimaryTabRow(
                selectedTabIndex = selectedTab,
                containerColor = DeepVoid.copy(alpha = 0.4f),
                contentColor = GoldBright,
            ) {
                Tab(
                    selected = selectedTab == HistoryTab.STORIES.ordinal,
                    onClick = { selectedTab = HistoryTab.STORIES.ordinal },
                    text = { Text(context.getString(R.string.history_tab_stories)) },
                )
                Tab(
                    selected = selectedTab == HistoryTab.LISTENING.ordinal,
                    onClick = { selectedTab = HistoryTab.LISTENING.ordinal },
                    text = { Text(context.getString(R.string.history_tab_listening)) },
                )
            }

            when (HistoryTab.entries[selectedTab]) {
                HistoryTab.STORIES -> StoryHistoryTab(app = app)
                HistoryTab.LISTENING -> ListeningHistoryTab(app = app)
            }
        }
    }
}

@Composable
private fun StoryHistoryTab(app: MusicStoryApp) {
    val context = LocalContext.current
    val history by app.storyRepository.storyHistory.collectAsState(initial = emptyList())
    var expandedId by remember { mutableLongStateOf(-1L) }

    if (history.isEmpty()) {
        EmptyHistoryState(message = context.getString(R.string.history_empty))
    } else {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp, top = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(history, key = { it.id }) { entry ->
                StoryHistoryItem(
                    entry = entry,
                    expanded = expandedId == entry.id,
                    onToggle = {
                        expandedId = if (expandedId == entry.id) -1L else entry.id
                    },
                )
            }
        }
    }
}

@Composable
private fun ListeningHistoryTab(app: MusicStoryApp) {
    val context = LocalContext.current
    val scrobbles by app.scrobbleRepository.history.collectAsState(initial = emptyList())

    if (scrobbles.isEmpty()) {
        EmptyHistoryState(message = context.getString(R.string.listening_empty))
    } else {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp, top = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(scrobbles, key = { it.id }) { entry ->
                ListeningHistoryItem(entry = entry)
            }
        }
    }
}

@Composable
private fun EmptyHistoryState(message: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        VinylDisc(size = 100.dp, isSpinning = false)
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MutedLavender,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun StoryHistoryItem(
    entry: StoryHistoryEntry,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val context = LocalContext.current
    val formatter = rememberDateFormatter()

    GlassCard(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize()
            .clickable(onClick = onToggle),
        cornerRadius = 18.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.MenuBook,
                contentDescription = null,
                tint = GoldBright.copy(alpha = 0.7f),
                modifier = Modifier.size(28.dp),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp),
            ) {
                Text(
                    text = entry.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = CreamText,
                    maxLines = if (expanded) Int.MAX_VALUE else 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = entry.artist, style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = formatter.format(Date(entry.playedAt)),
                    style = MaterialTheme.typography.bodySmall,
                )
                entry.angle?.takeIf { it.isNotBlank() }?.let { angle ->
                    Text(
                        text = angle.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelMedium,
                        color = GoldBright.copy(alpha = 0.85f),
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = if (expanded) {
                        entry.script
                    } else {
                        entry.script.take(PREVIEW_CHARS).let { preview ->
                            if (entry.script.length > PREVIEW_CHARS) "$preview…" else preview
                        }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText.copy(alpha = if (expanded) 1f else 0.88f),
                    maxLines = if (expanded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!expanded && entry.script.length > PREVIEW_CHARS) {
                    Text(
                        text = context.getString(R.string.history_tap_to_expand),
                        style = MaterialTheme.typography.labelSmall,
                        color = MutedLavender,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) {
                    context.getString(R.string.history_collapse)
                } else {
                    context.getString(R.string.history_expand)
                },
                tint = GoldBright.copy(alpha = 0.75f),
                modifier = Modifier
                    .padding(start = 4.dp)
                    .size(24.dp),
            )
        }
    }
}

@Composable
private fun ListeningHistoryItem(entry: ScrobbleEntry) {
    val context = LocalContext.current
    val formatter = rememberDateFormatter()

    GlassCard(
        modifier = Modifier.fillMaxWidth(),
        cornerRadius = 18.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Default.Headphones,
                contentDescription = null,
                tint = GoldBright.copy(alpha = 0.7f),
                modifier = Modifier.size(28.dp),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp),
            ) {
                Text(
                    text = entry.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = CreamText,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = entry.artist, style = MaterialTheme.typography.bodyMedium, color = GoldBright)
                entry.genre?.takeIf { it.isNotBlank() }?.let { genre ->
                    Text(
                        text = genre.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                }
                Text(
                    text = formatter.format(Date(entry.scrobbledAt)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MutedLavender,
                )
                if (entry.storyTriggered) {
                    Text(
                        text = context.getString(R.string.listening_story_badge),
                        style = MaterialTheme.typography.labelSmall,
                        color = LiveGreen,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                entry.packageName?.takeIf { it.isNotBlank() }?.let { pkg ->
                    Spacer(modifier = Modifier.height(8.dp))
                    SourceBadge(packageName = pkg)
                }
            }
        }
    }
}

@Composable
private fun rememberDateFormatter(): SimpleDateFormat {
    return SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("ru", "RU"))
}

private const val PREVIEW_CHARS = 120
