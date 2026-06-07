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
import com.musicstory.app.ui.theme.AccentViolet
import com.musicstory.app.ui.theme.CreamText

@Composable
fun BrandTitle(
    modifier: Modifier = Modifier,
    fontSize: TextUnit = MaterialTheme.typography.headlineMedium.fontSize,
    lineHeight: TextUnit = MaterialTheme.typography.headlineMedium.lineHeight,
) {
    Text(
        modifier = modifier,
        text = buildAnnotatedString {
            withStyle(
                SpanStyle(
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.SemiBold,
                    color = CreamText,
                ),
            ) {
                append("Эфир ")
            }
            withStyle(
                SpanStyle(
                    fontFamily = FontFamily.SansSerif,
                    fontWeight = FontWeight.Bold,
                    color = AccentViolet,
                    letterSpacing = MaterialTheme.typography.labelLarge.letterSpacing,
                ),
            ) {
                append("AI")
            }
        },
        style = MaterialTheme.typography.headlineMedium.copy(
            fontSize = fontSize,
            lineHeight = lineHeight,
        ),
    )
}
