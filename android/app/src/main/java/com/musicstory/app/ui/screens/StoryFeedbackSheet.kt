package com.musicstory.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    var selectedReasons by remember { mutableStateOf(setOf<String>()) }
    var sent by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }

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

    LaunchedEffect(sent) {
        if (sent) {
            delay(1400)
            onDismiss()
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(DeepVoid.copy(alpha = 0.96f), RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = context.getString(R.string.feedback_title),
            style = MaterialTheme.typography.titleMedium,
            color = CreamText,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(14.dp))
        if (sent) {
            Text(
                text = context.getString(R.string.feedback_thanks),
                style = MaterialTheme.typography.bodyMedium,
                color = LiveGreen,
            )
            return@Column
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FeedbackVoteButton(
                emoji = context.getString(R.string.feedback_like),
                selected = vote == "like",
                onClick = {
                    vote = "like"
                    selectedReasons = emptySet()
                },
            )
            FeedbackVoteButton(
                emoji = context.getString(R.string.feedback_dislike),
                selected = vote == "dislike",
                onClick = {
                    vote = "dislike"
                    selectedReasons = emptySet()
                },
            )
        }
        vote?.let { selectedVote ->
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = context.getString(R.string.feedback_pick_reasons),
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            val reasons = if (selectedVote == "like") likeReasons else dislikeReasons
            reasons.forEach { (reasonId, labelRes) ->
                val picked = selectedReasons.contains(reasonId)
                Text(
                    text = context.getString(labelRes),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            if (picked) GoldBright.copy(alpha = 0.22f) else GoldWarm.copy(alpha = 0.10f),
                        )
                        .border(
                            width = if (picked) 1.5.dp else 0.dp,
                            color = if (picked) GoldBright else GoldWarm.copy(alpha = 0f),
                            shape = RoundedCornerShape(12.dp),
                        )
                        .clickable {
                            selectedReasons = if (picked) {
                                selectedReasons - reasonId
                            } else {
                                selectedReasons + reasonId
                            }
                        }
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (picked) CreamText else MutedLavender,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            SecondaryStoryButton(
                text = context.getString(R.string.feedback_send),
                enabled = selectedReasons.isNotEmpty() && !sending,
                onClick = {
                    if (sending) return@SecondaryStoryButton
                    sending = true
                    scope.launch {
                        val ok = app.storyRepository.submitPendingStoryFeedback(
                            feedback = feedback,
                            vote = selectedVote,
                            reasons = selectedReasons.toList(),
                        )
                        if (ok) {
                            sent = true
                        }
                        sending = false
                    }
                },
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        SecondaryStoryButton(text = context.getString(R.string.feedback_skip), onClick = onDismiss)
    }
}

@Composable
private fun FeedbackVoteButton(emoji: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(
                if (selected) GoldBright.copy(alpha = 0.28f) else GoldWarm.copy(alpha = 0.12f),
            )
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) GoldBright else GoldWarm.copy(alpha = 0.35f),
                shape = CircleShape,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = emoji,
            fontSize = 32.sp,
            textAlign = TextAlign.Center,
        )
    }
}
