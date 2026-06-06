package com.musicstory.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.domain.GenerationPreviewState
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.R

@Composable
fun GenerationStoryPreview(
    preview: GenerationPreviewState,
    modifier: Modifier = Modifier,
) {
    if (!preview.isActive || preview.words.isEmpty()) return

    val context = LocalContext.current

    val animatedAlpha by animateFloatAsState(
        targetValue = preview.alpha,
        animationSpec = tween(durationMillis = 120),
        label = "generationPreviewAlpha",
    )

    val visibleText = preview.words
        .take(preview.visibleWordCount.coerceIn(0, preview.words.size))
        .joinToString(" ")

    if (visibleText.isBlank()) return

    val previewHeight = (LocalConfiguration.current.screenHeightDp * 0.22f).coerceIn(96f, 200f).dp
    val scrollState = rememberScrollState()
    val wordRatio = preview.visibleWordCount.toFloat() / preview.words.size.coerceAtLeast(1)

    LaunchedEffect(wordRatio, scrollState.maxValue) {
        if (scrollState.maxValue <= 0) return@LaunchedEffect
        val target = (scrollState.maxValue * wordRatio).toInt().coerceIn(0, scrollState.maxValue)
        scrollState.animateScrollTo(target)
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(previewHeight)
            .alpha(animatedAlpha)
            .padding(horizontal = 2.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White.copy(alpha = 0.05f),
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            if (preview.isSpokenTranscript) {
                Text(
                    text = context.getString(R.string.story_spoken_transcript_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MutedLavender,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 6.dp),
                    textAlign = TextAlign.Center,
                )
            }
            Text(
                text = visibleText,
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(scrollState, enabled = false),
                style = MaterialTheme.typography.bodyLarge,
                color = CreamText,
                textAlign = TextAlign.Center,
                softWrap = true,
            )
        }
    }
}
