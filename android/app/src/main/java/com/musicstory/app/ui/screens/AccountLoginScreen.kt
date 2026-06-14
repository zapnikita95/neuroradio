package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.musicstory.app.ui.components.BrandTitle
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
    var showHelpDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val url = app.settingsDataStore.backendUrl.first()
        if (url.isNotBlank()) {
            authConfig = app.accountAuthManager.fetchConfig(url)
            loginMode = when {
                authConfig?.emailEnabled == true -> LoginMode.EMAIL
                authConfig?.showsTelegramLogin == true -> LoginMode.TELEGRAM
                else -> LoginMode.EMAIL
            }
        }
    }

    if (showHelpDialog) {
        AlertDialog(
            onDismissRequest = { showHelpDialog = false },
            title = {
                Text(
                    text = context.getString(R.string.account_login_help_title),
                    color = CreamText,
                )
            },
            text = {
                Text(
                    text = context.getString(R.string.account_login_help_body),
                    color = MutedLavender,
                )
            },
            confirmButton = {
                TextButton(onClick = { showHelpDialog = false }) {
                    Text(context.getString(R.string.account_login_help_ok), color = GoldBright)
                }
            },
        )
    }

    MusicStoryBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 24.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(modifier = Modifier.size(48.dp))
                Text(
                    text = context.getString(R.string.account_login_title),
                    style = MaterialTheme.typography.headlineMedium,
                    textAlign = TextAlign.Center,
                    color = CreamText,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { showHelpDialog = true }) {
                    Icon(
                        imageVector = Icons.Default.HelpOutline,
                        contentDescription = context.getString(R.string.account_login_help_title),
                        tint = MutedLavender,
                    )
                }
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BrandTitle()
                Spacer(modifier = Modifier.height(12.dp))
                VinylDisc(size = 88.dp, isSpinning = true)
                Spacer(modifier = Modifier.height(16.dp))
                GlassCard(accentBorder = true, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        if (authConfig?.emailEnabled == true && authConfig?.showsTelegramLogin == true) {
                            LoginModeSwitch(
                                mode = loginMode,
                                onModeChange = { loginMode = it },
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                        }

                        when {
                            loginMode == LoginMode.TELEGRAM && authConfig?.showsTelegramLogin == true ->
                                AccountTelegramLoginSection(
                                    app = app,
                                    scope = scope,
                                    onLoggedIn = onLoggedIn,
                                )
                            authConfig?.emailEnabled == true ->
                                AccountEmailLoginContent(
                                    app = app,
                                    scope = scope,
                                    showSkip = false,
                                    onSkip = onSkip,
                                    onLoggedIn = onLoggedIn,
                                )
                            authConfig?.showsTelegramLogin == true ->
                                AccountTelegramLoginSection(
                                    app = app,
                                    scope = scope,
                                    onLoggedIn = onLoggedIn,
                                )
                            else ->
                                AccountEmailLoginContent(
                                    app = app,
                                    scope = scope,
                                    showSkip = false,
                                    onSkip = onSkip,
                                    onLoggedIn = onLoggedIn,
                                )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                SecondaryStoryButton(
                    text = context.getString(R.string.account_login_skip),
                    onClick = onSkip,
                    modifier = Modifier.fillMaxWidth(),
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
    Row(
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
