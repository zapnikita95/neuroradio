package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender

@Composable
fun AccountLoginScreen(
    onLoggedIn: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val scope = rememberCoroutineScope()

    MusicStoryBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Music Story",
                style = MaterialTheme.typography.labelLarge,
                color = GoldBright,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = context.getString(R.string.account_login_title),
                style = MaterialTheme.typography.displaySmall,
                textAlign = TextAlign.Center,
                color = CreamText,
            )
            Spacer(modifier = Modifier.height(16.dp))
            VinylDisc(size = 96.dp, isSpinning = true)
            Spacer(modifier = Modifier.height(20.dp))
            GlassCard(accentBorder = true, modifier = Modifier.fillMaxWidth()) {
                AccountEmailLoginContent(
                    app = app,
                    scope = scope,
                    showSkip = true,
                    onSkip = onSkip,
                    onLoggedIn = onLoggedIn,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = context.getString(R.string.account_login_trial_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
                textAlign = TextAlign.Center,
            )
        }
    }
}
