package com.musicstory.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.theme.Copper
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.VinylBlack
import com.musicstory.app.ui.theme.VinylGroove
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun VinylDisc(
    modifier: Modifier = Modifier,
    size: Dp = 160.dp,
    isSpinning: Boolean = false,
    tonearmOnDisc: Boolean = true,
    aiSparkle: Boolean = false,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "vinyl")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "rotation",
    )
    val sparklePhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "sparkle",
    )
    val armProgress by animateFloatAsState(
        targetValue = if (tonearmOnDisc) 1f else 0f,
        animationSpec = tween(durationMillis = 650),
        label = "tonearm",
    )

    Box(
        modifier = modifier.size(size * 1.22f),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            modifier = Modifier
                .size(size)
                .rotate(if (isSpinning) rotation else 0f),
        ) {
            val radius = this.size.minDimension / 2f
            val center = Offset(this.size.width / 2f, this.size.height / 2f)

            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(VinylGroove, VinylBlack),
                    center = center,
                    radius = radius,
                ),
                radius = radius,
                center = center,
            )

            listOf(0.78f, 0.62f, 0.48f).forEach { scale ->
                drawCircle(
                    color = GoldBright.copy(alpha = 0.08f),
                    radius = radius * scale,
                    center = center,
                    style = Stroke(width = 1.2f),
                )
            }

            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(GoldBright, GoldWarm, Copper),
                ),
                radius = radius * 0.18f,
                center = center,
            )

            drawCircle(
                color = VinylBlack,
                radius = radius * 0.05f,
                center = center,
            )
        }

        if (isSpinning) {
            Canvas(modifier = Modifier.size(size * 1.08f)) {
                drawCircle(
                    color = GoldBright.copy(alpha = 0.12f),
                    radius = this.size.minDimension / 2f,
                    style = Stroke(width = 2f),
                )
            }
        }

        Canvas(modifier = Modifier.matchParentSize()) {
            val discCenter = Offset(this.size.width / 2f, this.size.height / 2f)
            val discRadius = size.toPx() / 2f
            val grooveRadius = discRadius * 0.68f
            val grooveAngle = Math.toRadians(38.0).toFloat()
            val contactOnDisc = Offset(
                discCenter.x + grooveRadius * cos(grooveAngle),
                discCenter.y + grooveRadius * sin(grooveAngle),
            )
            val contactOffDisc = Offset(
                discCenter.x + discRadius * 1.08f,
                discCenter.y - discRadius * 0.42f,
            )
            val tip = Offset(
                contactOffDisc.x + (contactOnDisc.x - contactOffDisc.x) * armProgress,
                contactOffDisc.y + (contactOnDisc.y - contactOffDisc.y) * armProgress,
            )
            val pivot = Offset(
                discCenter.x + discRadius * 0.92f,
                discCenter.y - discRadius * 0.82f,
            )

            drawCircle(
                color = GoldWarm.copy(alpha = 0.85f),
                radius = size.toPx() * 0.028f,
                center = pivot,
            )
            drawLine(
                color = Color(0xFFE8E0D4),
                start = pivot,
                end = tip,
                strokeWidth = size.toPx() * 0.018f,
                cap = StrokeCap.Round,
            )
            drawCircle(
                color = VinylBlack,
                radius = size.toPx() * 0.034f,
                center = tip,
            )
            drawCircle(
                color = GoldBright.copy(alpha = 0.7f),
                radius = size.toPx() * 0.012f,
                center = tip,
            )

            if (aiSparkle) {
                val sparkCount = 6
                for (i in 0 until sparkCount) {
                    val phase = (sparklePhase + i.toFloat() / sparkCount) % 1f
                    val angle = phase * 2f * PI.toFloat()
                    val orbit = grooveRadius * (0.85f + 0.12f * sin(phase * PI.toFloat() * 2f))
                    val sparkCenter = Offset(
                        discCenter.x + orbit * cos(angle),
                        discCenter.y + orbit * sin(angle),
                    )
                    drawCircle(
                        color = GoldBright.copy(alpha = 0.25f + 0.55f * (1f - phase)),
                        radius = size.toPx() * 0.014f,
                        center = sparkCenter,
                    )
                }
            }
        }
    }
}

@Composable
fun LivePulseDot(
    modifier: Modifier = Modifier,
    color: Color = GoldBright,
    active: Boolean = true,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "alpha",
    )

    Canvas(modifier = modifier.size(10.dp)) {
        if (active) {
            drawCircle(
                color = color.copy(alpha = alpha * 0.35f),
                radius = size.minDimension / 1.4f,
            )
        }
        drawCircle(
            color = if (active) color.copy(alpha = alpha) else Color.Gray,
            radius = size.minDimension / 2.8f,
        )
    }
}
