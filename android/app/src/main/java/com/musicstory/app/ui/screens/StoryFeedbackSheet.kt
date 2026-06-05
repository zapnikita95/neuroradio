package com.musicstory.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.domain.PendingStoryFeedback
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun StoryFeedbackSheet(
    feedback: PendingStoryFeedback,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val scope = rememberCoroutineScope()
    var vote by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }

    val likeReasons = listOf(
        "interesting_fact" to R.string.feedback_like_interesting,
        "good_speech" to R.string.feedback_like_speech,
        "good_persona" to R.string.feedback_like_persona,
    )
    val dislikeReasons = listOf(
        "hallucination" to R.string.feedback_dislike_hallucination,
        "boring_fact" to R.string.feedback_dislike_boring,
        "unnatural_voice" to R.string.feedback_dislike_voice,
        "speech_manner" to R.string.feedback_dislike_manner,
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(DeepVoid.copy(alpha = 0.96f), RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = context.getString(R.string.feedback_title),
            style = MaterialTheme.typography.titleMedium,
            color = CreamText,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(12.dp))
        if (sent) {
            Text(
                text = context.getString(R.string.feedback_thanks),
                style = MaterialTheme.typography.bodyMedium,
                color = LiveGreen,
            )
            Spacer(modifier = Modifier.height(8.dp))
            SecondaryStoryButton(text = context.getString(R.string.feedback_close), onClick = onDismiss)
            return@Column
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            FeedbackVoteChip(
                label = context.getString(R.string.feedback_like),
                selected = vote == "like",
                onClick = { vote = "like" },
            )
            FeedbackVoteChip(
                label = context.getString(R.string.feedback_dislike),
                selected = vote == "dislike",
                onClick = { vote = "dislike" },
            )
        }
        vote?.let { selectedVote ->
            Spacer(modifier = Modifier.height(12.dp))
            val reasons = if (selectedVote == "like") likeReasons else dislikeReasons
            reasons.forEach { (reasonId, labelRes) ->
                Text(
                    text = context.getString(labelRes),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                        .background(GoldWarm.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                        .clickable {
                            scope.launch {
                                val url = app.settingsDataStore.backendUrl.first()
                                app.apiClient.submitStoryFeedback(
                                    baseUrl = url,
                                    artist = feedback.artist,
                                    title = feedback.title,
                                    vote = selectedVote,
                                    reason = reasonId,
                                    script = feedback.script,
                                )
                                sent = true
                            }
                        }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText,
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        SecondaryStoryButton(text = context.getString(R.string.feedback_skip), onClick = onDismiss)
    }
}

@Composable
private fun FeedbackVoteChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        modifier = Modifier
            .background(
                if (selected) GoldBright.copy(alpha = 0.25f) else GoldWarm.copy(alpha = 0.10f),
                RoundedCornerShape(14.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) GoldBright else MutedLavender,
    )
}
