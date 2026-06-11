package com.musicstory.app.ui.components

import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.musicstory.app.R
import com.musicstory.app.domain.GenerationPreviewState
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.MutedLavender
import kotlinx.coroutines.delay

/** Story text during playback — docked above buttons, grows bottom → top with smooth scroll. */
@Composable
fun GenerationStoryPreview(
    preview: GenerationPreviewState,
    modifier: Modifier = Modifier,
) {
    if (!preview.isActive || preview.words.isEmpty()) return

    val context = LocalContext.current

    val visibleText = preview.words
        .take(preview.visibleWordCount.coerceIn(0, preview.words.size))
        .joinToString(" ")

    if (visibleText.isBlank()) return

    val screenHeightDp = LocalConfiguration.current.screenHeightDp
    val previewHeight = (screenHeightDp * 0.38f).coerceIn(260f, 420f).dp
    val scrollState = rememberScrollState()

    LaunchedEffect(visibleText) {
        delay(32)
        val target = scrollState.maxValue
        val delta = target - scrollState.value
        if (delta > 0) {
            scrollState.animateScrollBy(delta.toFloat(), animationSpec = tween(durationMillis = 220))
        }
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(previewHeight)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White.copy(alpha = 0.07f),
        tonalElevation = 0.dp,
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                if (preview.isSpokenTranscript) {
                    Text(
                        text = context.getString(R.string.story_spoken_transcript_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = MutedLavender,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp),
                        textAlign = TextAlign.Center,
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(scrollState),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = visibleText,
                            modifier = Modifier.fillMaxWidth(),
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontSize = 18.sp,
                                lineHeight = 26.sp,
                                lineHeightStyle = LineHeightStyle(
                                    alignment = LineHeightStyle.Alignment.Center,
                                    trim = LineHeightStyle.Trim.None,
                                ),
                            ),
                            color = CreamText,
                            textAlign = TextAlign.Center,
                            softWrap = true,
                        )
                    }
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(32.dp)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color(0xFF141018).copy(alpha = 0.95f),
                                Color.Transparent,
                            ),
                        ),
                    ),
            )
        }
    }
}
