package com.musicstory.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.remote.AccountAuthManager
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private suspend fun finishAccountLogin(app: MusicStoryApp) {
    app.settingsDataStore.setAccountLinked(true)
    val url = app.settingsDataStore.backendUrl.first()
    if (url.isNotBlank()) {
        app.storyRepository.mergeHistoryFromServer(url)
    }
}

private suspend fun runTelegramBotLogin(
    app: MusicStoryApp,
    context: android.content.Context,
    onMessage: (String) -> Unit,
    onSuccess: () -> Unit,
): Boolean {
    val url = app.settingsDataStore.backendUrl.first()
    if (url.isBlank()) {
        onMessage(context.getString(R.string.settings_auth_verify_failed))
        return false
    }
    val start = app.accountAuthManager.startTelegramMobileLogin(url)
    if (start == null) {
        onMessage(context.getString(R.string.settings_auth_verify_failed))
        return false
    }
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(start.deepLink)))
    onMessage(context.getString(R.string.settings_auth_telegram_waiting))

    val deadline = System.currentTimeMillis() + start.expiresInSec * 1000L
    while (System.currentTimeMillis() < deadline) {
        delay(2_000)
        when (val poll = app.accountAuthManager.pollTelegramMobileLogin(url, start.code)) {
            is AccountAuthManager.TelegramPollResult.Pending -> Unit
            is AccountAuthManager.TelegramPollResult.Success -> {
                finishAccountLogin(app)
                onMessage(context.getString(R.string.settings_auth_success))
                onSuccess()
                return true
            }
            is AccountAuthManager.TelegramPollResult.Error -> {
                onMessage(poll.message)
                return false
            }
        }
    }
    onMessage(context.getString(R.string.settings_auth_telegram_timeout))
    return false
}

@Composable
fun AccountStatusSection(
    app: MusicStoryApp,
    onOpenLogin: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<AccountAuthManager.AccountProfile?>(null) }
    var authConfig by remember { mutableStateOf<AccountAuthManager.AuthConfig?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val url = app.settingsDataStore.backendUrl.first()
        if (url.isNotBlank()) {
            authConfig = app.accountAuthManager.fetchConfig(url)
            profile = app.accountAuthManager.fetchProfile(url)
        }
    }

    Column {
        profile?.takeIf { it.isLoggedIn }?.let { p ->
            Text(
                text = accountStatusText(context, p),
                style = MaterialTheme.typography.labelMedium,
                color = LiveGreen,
            )
            p.email?.let { email ->
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = email,
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText,
                )
            }
            p.telegramUsername?.let { username ->
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "@$username",
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText,
                )
            } ?: p.telegramId?.let {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = context.getString(R.string.settings_auth_telegram_linked),
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText,
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = context.getString(R.string.settings_auth_link_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
            )

            if (p.email.isNullOrBlank() && authConfig?.emailEnabled == true) {
                Spacer(modifier = Modifier.height(12.dp))
                AccountEmailLoginContent(
                    app = app,
                    scope = scope,
                    showSkip = false,
                    compact = true,
                    onSkip = {},
                    onLoggedIn = {
                        scope.launch {
                            val url = app.settingsDataStore.backendUrl.first()
                            profile = app.accountAuthManager.fetchProfile(url)
                        }
                    },
                )
            }

            if (p.telegramId == null && authConfig?.telegramEnabled == true) {
                Spacer(modifier = Modifier.height(12.dp))
                PrimaryStoryButton(
                    text = context.getString(R.string.settings_auth_link_telegram),
                    onClick = {
                        if (busy) return@PrimaryStoryButton
                        scope.launch {
                            busy = true
                            message = null
                            runTelegramBotLogin(
                                app = app,
                                context = context,
                                onMessage = { message = it },
                                onSuccess = {
                                    scope.launch {
                                        val url = app.settingsDataStore.backendUrl.first()
                                        profile = app.accountAuthManager.fetchProfile(url)
                                    }
                                },
                            )
                            busy = false
                        }
                    },
                )
            }
        } ?: run {
            Text(
                text = context.getString(R.string.settings_auth_not_linked),
                style = MaterialTheme.typography.bodyMedium,
                color = MutedLavender,
            )
            Spacer(modifier = Modifier.height(12.dp))
            PrimaryStoryButton(
                text = context.getString(R.string.settings_auth_open_login),
                onClick = onOpenLogin,
            )
        }

        message?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = if (it.contains("ошиб", ignoreCase = true)) ErrorCoral else LiveGreen,
            )
        }
    }
}

@Composable
fun AccountEmailLoginContent(
    app: MusicStoryApp,
    scope: CoroutineScope,
    showSkip: Boolean,
    onSkip: () -> Unit,
    onLoggedIn: () -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = GoldBright,
        unfocusedBorderColor = GoldWarm.copy(alpha = 0.35f),
        focusedLabelColor = GoldBright,
        cursorColor = GoldBright,
        focusedTextColor = CreamText,
        unfocusedTextColor = CreamText,
    )

    Column(modifier = modifier) {
        if (!compact) {
            Text(
                text = context.getString(R.string.account_login_subtitle),
                style = MaterialTheme.typography.bodyLarge,
                color = MutedLavender,
            )
            Spacer(modifier = Modifier.height(16.dp))
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it.trim() },
            label = { Text(context.getString(R.string.settings_auth_email)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !codeSent && !busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            colors = fieldColors,
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (!codeSent) {
            PrimaryStoryButton(
                text = context.getString(R.string.settings_auth_send_code),
                onClick = {
                    if (busy || email.isBlank()) return@PrimaryStoryButton
                    scope.launch {
                        busy = true
                        message = null
                        val url = app.settingsDataStore.backendUrl.first()
                        val err = app.accountAuthManager.startEmailLogin(url, email)
                        if (err == null) {
                            codeSent = true
                            message = context.getString(R.string.settings_auth_code_sent)
                        } else {
                            message = err
                        }
                        busy = false
                    }
                },
            )
        } else {
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.filter { ch -> ch.isDigit() }.take(6) },
                label = { Text(context.getString(R.string.settings_auth_code)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = fieldColors,
                shape = RoundedCornerShape(14.dp),
            )
            Spacer(modifier = Modifier.height(8.dp))
            PrimaryStoryButton(
                text = context.getString(R.string.settings_auth_verify),
                onClick = {
                    if (busy || code.length < 4) return@PrimaryStoryButton
                    scope.launch {
                        busy = true
                        message = null
                        val url = app.settingsDataStore.backendUrl.first()
                        val p = app.accountAuthManager.verifyEmailLogin(url, email, code)
                        if (p != null) {
                            finishAccountLogin(app)
                            message = context.getString(R.string.settings_auth_success)
                            onLoggedIn()
                        } else {
                            message = context.getString(R.string.settings_auth_verify_failed)
                        }
                        busy = false
                    }
                },
            )
            Spacer(modifier = Modifier.height(8.dp))
            SecondaryStoryButton(
                text = context.getString(R.string.settings_auth_resend),
                onClick = { codeSent = false; code = "" },
            )
        }

        message?.let {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = if (it.contains("ошиб", ignoreCase = true) ||
                    it.contains("не удал", ignoreCase = true)
                ) {
                    ErrorCoral
                } else {
                    LiveGreen
                },
            )
        }

        if (showSkip) {
            Spacer(modifier = Modifier.height(16.dp))
            SecondaryStoryButton(
                text = context.getString(R.string.account_login_skip),
                onClick = onSkip,
            )
        }
    }
}

@Composable
fun AccountTelegramLoginSection(
    app: MusicStoryApp,
    scope: CoroutineScope,
    onLoggedIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        Text(
            text = context.getString(R.string.settings_auth_telegram_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MutedLavender,
        )
        Spacer(modifier = Modifier.height(12.dp))
        PrimaryStoryButton(
            text = context.getString(R.string.settings_auth_telegram),
            onClick = {
                if (busy) return@PrimaryStoryButton
                scope.launch {
                    busy = true
                    message = null
                    runTelegramBotLogin(
                        app = app,
                        context = context,
                        onMessage = { message = it },
                        onSuccess = onLoggedIn,
                    )
                    busy = false
                }
            },
        )
        message?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = if (it.contains("ошиб", ignoreCase = true) || it.contains("истёк", ignoreCase = true)) {
                    ErrorCoral
                } else {
                    LiveGreen
                },
            )
        }
    }
}

private fun accountStatusText(
    context: android.content.Context,
    profile: AccountAuthManager.AccountProfile,
): String {
    return when {
        profile.plan == "premium" && (profile.premiumUntil ?: 0L) > System.currentTimeMillis() ->
            context.getString(R.string.settings_auth_premium)
        profile.plan == "trial" && (profile.trialUntil ?: 0L) > System.currentTimeMillis() -> {
            val until = SimpleDateFormat("d MMM", Locale("ru")).format(Date(profile.trialUntil!!))
            context.getString(R.string.settings_auth_trial_until, until)
        }
        else -> context.getString(R.string.settings_auth_linked)
    }
}
