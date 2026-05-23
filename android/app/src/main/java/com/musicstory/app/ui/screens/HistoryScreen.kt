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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Album
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.local.ScrobbleEntry
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val history by app.scrobbleRepository.history.collectAsState(initial = emptyList())

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

            if (history.isEmpty()) {
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
                        text = context.getString(R.string.history_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MutedLavender,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(history, key = { it.id }) { entry ->
                        HistoryItem(entry = entry)
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryItem(entry: ScrobbleEntry) {
    val context = LocalContext.current
    val formatter = rememberDateFormatter()

    GlassCard(cornerRadius = 18.dp) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                imageVector = Icons.Default.Album,
                contentDescription = null,
                tint = GoldBright.copy(alpha = 0.7f),
                modifier = Modifier.size(28.dp),
            )
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(
                    text = entry.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = CreamText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = entry.artist, style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = formatter.format(Date(entry.scrobbledAt)),
                    style = MaterialTheme.typography.bodySmall,
                )
                if (entry.storyTriggered) {
                    Text(
                        text = context.getString(R.string.history_story_triggered),
                        style = MaterialTheme.typography.labelMedium,
                        color = GoldBright,
                    )
                }
            }
        }
    }
}

@Composable
private fun rememberDateFormatter(): SimpleDateFormat {
    return SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("ru", "RU"))
}
