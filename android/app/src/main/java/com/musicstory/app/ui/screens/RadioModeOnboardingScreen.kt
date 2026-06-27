package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.components.BrandTitle
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.R

@Composable
fun RadioModeOnboardingScreen(
    onFinished: () -> Unit,
    onEnableRadio: () -> Unit,
    onScrobbleOnly: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var showDeferExplanation by remember { mutableStateOf(false) }

    MusicStoryBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(36.dp))
            BrandTitle()
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = context.getString(
                    if (showDeferExplanation) {
                        R.string.radio_onboarding_defer_title
                    } else {
                        R.string.radio_onboarding_title
                    },
                ),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                color = CreamText,
            )

            Spacer(modifier = Modifier.height(12.dp))

            GlassCard(accentBorder = true, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = context.getString(
                        if (showDeferExplanation) {
                            R.string.radio_onboarding_defer_body
                        } else {
                            R.string.radio_onboarding_body
                        },
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MutedLavender,
                    textAlign = TextAlign.Start,
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            if (showDeferExplanation) {
                PrimaryStoryButton(
                    text = context.getString(R.string.radio_onboarding_continue),
                    onClick = {
                        onScrobbleOnly()
                        onFinished()
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                PrimaryStoryButton(
                    text = context.getString(R.string.radio_onboarding_enable),
                    onClick = {
                        onEnableRadio()
                        onFinished()
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(10.dp))
                SecondaryStoryButton(
                    text = context.getString(R.string.radio_onboarding_later),
                    onClick = { showDeferExplanation = true },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
