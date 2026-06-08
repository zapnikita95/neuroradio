package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.remote.AccountAuthManager
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender
import kotlinx.coroutines.flow.first

@Composable
fun AccountLoginScreen(
    onLoggedIn: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val scope = rememberCoroutineScope()
    var authConfig by remember { mutableStateOf<AccountAuthManager.AuthConfig?>(null) }
    var loginMode by remember { mutableStateOf(LoginMode.EMAIL) }

    LaunchedEffect(Unit) {
        val url = app.settingsDataStore.backendUrl.first()
        if (url.isNotBlank()) {
            authConfig = app.accountAuthManager.fetchConfig(url)
            loginMode = when {
                authConfig?.emailEnabled == true -> LoginMode.EMAIL
                authConfig?.telegramEnabled == true -> LoginMode.TELEGRAM
                else -> LoginMode.EMAIL
            }
        }
    }

    MusicStoryBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 28.dp, bottom = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = context.getString(R.string.account_login_title),
                    style = MaterialTheme.typography.headlineMedium,
                    textAlign = TextAlign.Center,
                    color = CreamText,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                VinylDisc(size = 88.dp, isSpinning = true)
                Spacer(modifier = Modifier.height(16.dp))
                GlassCard(accentBorder = true, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        if (authConfig?.emailEnabled == true && authConfig?.telegramEnabled == true) {
                            LoginModeSwitch(
                                mode = loginMode,
                                onModeChange = { loginMode = it },
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                        }

                        when {
                            loginMode == LoginMode.TELEGRAM && authConfig?.telegramEnabled == true ->
                                AccountTelegramLoginSection(
                                    app = app,
                                    scope = scope,
                                    onLoggedIn = onLoggedIn,
                                )
                            authConfig?.emailEnabled == true ->
                                AccountEmailLoginContent(
                                    app = app,
                                    scope = scope,
                                    showSkip = true,
                                    onSkip = onSkip,
                                    onLoggedIn = onLoggedIn,
                                )
                            authConfig?.telegramEnabled == true ->
                                AccountTelegramLoginSection(
                                    app = app,
                                    scope = scope,
                                    onLoggedIn = onLoggedIn,
                                )
                            else ->
                                AccountEmailLoginContent(
                                    app = app,
                                    scope = scope,
                                    showSkip = true,
                                    onSkip = onSkip,
                                    onLoggedIn = onLoggedIn,
                                )
                        }
                    }
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
}

private enum class LoginMode { EMAIL, TELEGRAM }

@Composable
private fun LoginModeSwitch(
    mode: LoginMode,
    onModeChange: (LoginMode) -> Unit,
) {
    val context = LocalContext.current
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SecondaryStoryButton(
            text = context.getString(R.string.settings_auth_email),
            onClick = { onModeChange(LoginMode.EMAIL) },
            modifier = Modifier.weight(1f),
            enabled = mode != LoginMode.EMAIL,
        )
        SecondaryStoryButton(
            text = context.getString(R.string.settings_auth_telegram),
            onClick = { onModeChange(LoginMode.TELEGRAM) },
            modifier = Modifier.weight(1f),
            enabled = mode != LoginMode.TELEGRAM,
        )
    }
}
