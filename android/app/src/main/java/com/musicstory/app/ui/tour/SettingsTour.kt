package com.musicstory.app.ui.tour



import androidx.compose.foundation.background

import androidx.compose.foundation.border

import androidx.compose.foundation.layout.Arrangement

import androidx.compose.foundation.layout.Box

import androidx.compose.foundation.layout.Column

import androidx.compose.foundation.layout.Row

import androidx.compose.foundation.layout.fillMaxHeight

import androidx.compose.foundation.layout.fillMaxSize

import androidx.compose.foundation.layout.fillMaxWidth

import androidx.compose.foundation.layout.height

import androidx.compose.foundation.layout.offset

import androidx.compose.foundation.layout.padding

import androidx.compose.foundation.layout.width

import androidx.compose.foundation.shape.RoundedCornerShape

import androidx.compose.material3.MaterialTheme

import androidx.compose.material3.Text

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

import androidx.compose.ui.Alignment

import androidx.compose.ui.Modifier

import androidx.compose.ui.draw.clip

import androidx.compose.ui.geometry.Rect

import androidx.compose.ui.graphics.Color

import androidx.compose.ui.layout.boundsInRoot

import androidx.compose.ui.layout.onGloballyPositioned

import androidx.compose.ui.platform.LocalConfiguration

import androidx.compose.ui.platform.LocalDensity

import androidx.compose.ui.text.style.TextOverflow

import androidx.compose.ui.unit.dp

import androidx.compose.ui.zIndex

import com.musicstory.app.ui.components.PrimaryStoryButton

import com.musicstory.app.ui.components.SecondaryStoryButton

import com.musicstory.app.ui.theme.CreamText

import com.musicstory.app.ui.theme.DeepVoid

import com.musicstory.app.ui.theme.GoldBright

import com.musicstory.app.ui.theme.MutedLavender

import kotlin.math.roundToInt



data class SettingsTourStep(

    val title: String,

    val body: String,

)



/** Spotlight + tooltip: both are anchored to the measured settings card. */

@Composable

fun SettingsTourSpotlightOverlay(

    highlightRect: Rect?,

    stepIndex: Int,

    steps: List<SettingsTourStep>,

    onNext: () -> Unit,

    onSkip: () -> Unit,

    onControlsBottomChanged: (Float) -> Unit,
    onControlsTopChanged: (Float) -> Unit = {},

    modifier: Modifier = Modifier,

) {

    if (stepIndex !in steps.indices) return

    val step = steps[stepIndex]

    val isLast = stepIndex == steps.lastIndex

    val density = LocalDensity.current

    val screenHeightPx = with(density) { LocalConfiguration.current.screenHeightDp.dp.toPx() }
    val edgeMarginPx = with(density) { 16.dp.toPx() }
    val tooltipGapPx = with(density) { 10.dp.toPx() }
    val fallbackTooltipHeightPx = with(density) { 178.dp.toPx() }
    var tooltipHeightPx by remember(stepIndex) { mutableFloatStateOf(0f) }
    val measuredTooltipHeightPx = tooltipHeightPx.takeIf { it > 0f } ?: fallbackTooltipHeightPx
    val tooltipTopPx = highlightRect?.let { rect ->
        val roomBelow = screenHeightPx - rect.bottom - edgeMarginPx
        val roomAbove = rect.top - edgeMarginPx
        val preferBelow = roomBelow >= measuredTooltipHeightPx + tooltipGapPx || roomBelow >= roomAbove
        val desiredTop = if (preferBelow) {
            rect.bottom + tooltipGapPx
        } else {
            rect.top - measuredTooltipHeightPx - tooltipGapPx
        }
        desiredTop.coerceIn(edgeMarginPx, screenHeightPx - measuredTooltipHeightPx - edgeMarginPx)
    } ?: (screenHeightPx - measuredTooltipHeightPx - edgeMarginPx)



    Box(modifier = modifier.fillMaxSize()) {

        TourDimmingScrim(highlightRect = highlightRect)



        if (highlightRect != null) {

            val shape = RoundedCornerShape(16.dp)

            Box(

                modifier = Modifier

                    .zIndex(1f)

                    .offset {

                        with(density) {

                            androidx.compose.ui.unit.IntOffset(

                                highlightRect.left.roundToInt(),

                                highlightRect.top.roundToInt(),

                            )

                        }

                    }

                    .width(with(density) { highlightRect.width.toDp() })

                    .height(with(density) { highlightRect.height.toDp() })

                    .border(2.5.dp, GoldBright, shape),

            )

        }



        Column(

            modifier = Modifier

                .zIndex(2f)

                .align(Alignment.TopCenter)
                .offset {
                    androidx.compose.ui.unit.IntOffset(
                        x = 0,
                        y = tooltipTopPx.roundToInt(),
                    )
                }

                .fillMaxWidth()

                .padding(

                    start = 16.dp,

                    end = 16.dp,

                )

                .onGloballyPositioned { coords ->
                    val bounds = coords.boundsInRoot()
                    tooltipHeightPx = bounds.height
                    onControlsTopChanged(bounds.top)
                    onControlsBottomChanged(bounds.bottom)
                },

            verticalArrangement = Arrangement.spacedBy(10.dp),

        ) {

            Text(

                text = "Шаг ${stepIndex + 1} из ${steps.size}",

                style = MaterialTheme.typography.labelMedium,

                color = GoldBright,

            )

            Column(

                modifier = Modifier

                    .fillMaxWidth()

                    .clip(RoundedCornerShape(18.dp))

                    .background(DeepVoid.copy(alpha = 0.98f))

                    .border(1.dp, GoldBright.copy(alpha = 0.5f), RoundedCornerShape(18.dp))

                    .padding(16.dp),

                verticalArrangement = Arrangement.spacedBy(8.dp),

            ) {

                Text(

                    text = step.title,

                    style = MaterialTheme.typography.titleMedium,

                    color = CreamText,

                    maxLines = 2,

                    overflow = TextOverflow.Ellipsis,

                )

                Text(

                    text = step.body,

                    style = MaterialTheme.typography.bodyMedium,

                    color = MutedLavender,

                    maxLines = 8,

                    overflow = TextOverflow.Ellipsis,

                )

            }

            Row(

                modifier = Modifier.fillMaxWidth(),

                horizontalArrangement = Arrangement.spacedBy(10.dp),

            ) {

                SecondaryStoryButton(

                    text = "Пропустить",

                    onClick = onSkip,

                    modifier = Modifier.weight(1f),

                )

                PrimaryStoryButton(

                    text = if (isLast) "Готово" else "Далее",

                    onClick = onNext,

                    modifier = Modifier.weight(1f),

                )

            }

        }

    }

}



@Composable

private fun TourDimmingScrim(highlightRect: Rect?) {

    val dim = Color.Black.copy(alpha = 0.78f)

    val density = LocalDensity.current



    if (highlightRect == null || highlightRect.height < 4f) {

        Box(Modifier.fillMaxSize().background(dim))

        return

    }



    val pad = with(density) { 6.dp.toPx() }

    val hole = Rect(

        left = (highlightRect.left - pad).coerceAtLeast(0f),

        top = (highlightRect.top - pad).coerceAtLeast(0f),

        right = highlightRect.right + pad,

        bottom = highlightRect.bottom + pad,

    )



    val topH = with(density) { hole.top.toDp() }

    val holeH = with(density) { (hole.bottom - hole.top).toDp() }

    val leftW = with(density) { hole.left.toDp() }

    val rightPadStart = with(density) { hole.right.toDp() }

    val bottomPadTop = with(density) { hole.bottom.toDp() }



    Box(Modifier.fillMaxSize()) {

        Box(

            Modifier

                .fillMaxWidth()

                .height(topH)

                .align(Alignment.TopCenter)

                .background(dim),

        )

        Box(

            Modifier

                .fillMaxWidth()

                .padding(top = bottomPadTop)

                .fillMaxHeight()

                .align(Alignment.TopCenter)

                .background(dim),

        )

        Box(

            Modifier

                .width(leftW)

                .height(holeH)

                .offset(y = topH)

                .align(Alignment.TopStart)

                .background(dim),

        )

        Box(

            Modifier

                .fillMaxWidth()

                .padding(start = rightPadStart)

                .height(holeH)

                .offset(y = topH)

                .align(Alignment.TopStart)

                .background(dim),

        )

    }

}



fun Modifier.settingsTourHighlight(active: Boolean): Modifier = this


