package com.musicstory.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import com.musicstory.app.ui.theme.AmberGlow
import com.musicstory.app.ui.theme.Copper
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.DustyRose
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.NightPlum

@Composable
fun MusicStoryBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        DeepVoid,
                        NightPlum,
                        DeepVoid,
                    ),
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        GoldBright.copy(alpha = 0.12f),
                        GoldBright.copy(alpha = 0f),
                    ),
                    center = Offset(0.15f, 0.08f),
                    radius = 900f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Copper.copy(alpha = 0.18f),
                        Copper.copy(alpha = 0f),
                    ),
                    center = Offset(1.1f, 0.35f),
                    radius = 700f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        DustyRose.copy(alpha = 0.10f),
                        DustyRose.copy(alpha = 0f),
                    ),
                    center = Offset(0.5f, 1.05f),
                    radius = 800f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        AmberGlow.copy(alpha = 0.06f),
                        AmberGlow.copy(alpha = 0f),
                    ),
                    center = Offset(0.85f, 0.92f),
                    radius = 500f,
                ),
            ),
        content = content,
    )
}
