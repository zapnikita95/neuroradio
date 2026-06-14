package com.musicstory.app.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.res.stringResource
import com.musicstory.app.R
import com.musicstory.app.ui.theme.AccentViolet
import com.musicstory.app.ui.theme.CreamText

@Composable
fun BrandTitle(
    modifier: Modifier = Modifier,
    fontSize: TextUnit = MaterialTheme.typography.headlineMedium.fontSize,
    lineHeight: TextUnit = MaterialTheme.typography.headlineMedium.lineHeight,
) {
    val prefix = stringResource(R.string.brand_title_prefix)
    val accent = stringResource(R.string.brand_title_accent)
    val compact = (prefix.length + accent.length) > 9
    val effectiveSize = if (compact) fontSize * 0.78f else fontSize
    val effectiveLineHeight = if (compact) lineHeight * 0.78f else lineHeight
    Text(
        modifier = modifier,
        maxLines = 1,
        softWrap = false,
        text = buildAnnotatedString {
            withStyle(
                SpanStyle(
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.SemiBold,
                    color = CreamText,
                ),
            ) {
                append(stringResource(R.string.brand_title_prefix))
            }
            withStyle(
                SpanStyle(
                    fontFamily = FontFamily.SansSerif,
                    fontWeight = FontWeight.Bold,
                    color = AccentViolet,
                    letterSpacing = MaterialTheme.typography.labelLarge.letterSpacing,
                ),
            ) {
                append(stringResource(R.string.brand_title_accent))
            }
        },
        style = MaterialTheme.typography.headlineMedium.copy(
            fontSize = effectiveSize,
            lineHeight = effectiveLineHeight,
        ),
    )
}
