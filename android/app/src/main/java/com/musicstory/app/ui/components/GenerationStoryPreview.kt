package com.musicstory.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.domain.GenerationPreviewState
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.MutedLavender

@Composable
fun GenerationStoryPreview(
    preview: GenerationPreviewState,
    modifier: Modifier = Modifier,
) {
    if (!preview.isActive || preview.words.isEmpty()) return

    val animatedAlpha by animateFloatAsState(
        targetValue = preview.alpha,
        animationSpec = tween(durationMillis = 120),
        label = "generationPreviewAlpha",
    )

    val visibleText = preview.words
        .take(preview.visibleWordCount.coerceIn(0, preview.words.size))
        .joinToString(" ")

    if (visibleText.isBlank()) return

    val scrollState = rememberScrollState()
    LaunchedEffect(visibleText) {
        scrollState.animateScrollTo(scrollState.maxValue)
    }

    Text(
        text = visibleText,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 140.dp)
            .verticalScroll(scrollState)
            .alpha(animatedAlpha)
            .padding(horizontal = 4.dp, vertical = 8.dp),
        style = MaterialTheme.typography.bodyLarge,
        color = if (preview.visibleWordCount >= preview.words.size) {
            CreamText
        } else {
            MutedLavender
        },
        textAlign = TextAlign.Center,
    )
}
