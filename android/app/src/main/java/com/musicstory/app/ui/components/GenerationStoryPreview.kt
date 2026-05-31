package com.musicstory.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.domain.GenerationPreviewState
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.MutedLavender
import kotlinx.coroutines.delay

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
        if (scrollState.maxValue > 0) {
            val target = scrollState.maxValue
            val step = (target / 90).coerceAtLeast(1)
            var current = 0
            while (current < target) {
                current = (current + step).coerceAtMost(target)
                scrollState.scrollTo(current)
                delay(42L)
            }
        }
    }

    val maxHeight = (LocalConfiguration.current.screenHeightDp * 0.22f).coerceIn(96f, 200f).dp

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp, max = maxHeight)
            .alpha(animatedAlpha)
            .padding(horizontal = 2.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White.copy(alpha = 0.05f),
        tonalElevation = 0.dp,
    ) {
        Text(
            text = visibleText,
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            style = MaterialTheme.typography.bodyLarge,
            color = if (preview.visibleWordCount >= preview.words.size) {
                CreamText
            } else {
                MutedLavender
            },
            textAlign = TextAlign.Center,
            softWrap = true,
        )
    }
}
