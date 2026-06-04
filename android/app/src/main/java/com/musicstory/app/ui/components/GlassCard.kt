package com.musicstory.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.theme.GlassBorder
import com.musicstory.app.ui.theme.GlassHighlight
import com.musicstory.app.ui.theme.SurfaceElevated
import com.musicstory.app.ui.theme.SurfaceGlass

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 22.dp,
    accentBorder: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(cornerRadius),
        color = Color.Transparent,
        border = BorderStroke(
            width = 1.dp,
            brush = if (accentBorder) {
                Brush.linearGradient(listOf(GlassBorder, GlassHighlight, GlassBorder))
            } else {
                Brush.linearGradient(listOf(GlassHighlight, GlassHighlight))
            },
        ),
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            SurfaceGlass.copy(alpha = 0.96f),
                            SurfaceElevated.copy(alpha = 0.94f),
                        ),
                    ),
                )
                .padding(18.dp),
            content = content,
        )
    }
}
