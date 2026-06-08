package com.musicstory.app.ui.screens

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
import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.local.toCached
import com.musicstory.app.data.local.toProfile
import com.musicstory.app.data.remote.AccountAuthManager
import com.musicstory.app.ui.components.AuthPrivacyConsentRow
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.TelegramLoginWidgetSheet
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private suspend fun finishAccountLogin(
    app: MusicStoryApp,
    login: AccountAuthManager.AccountLoginResult,
) {
    app.settingsDataStore.setAccountLinked(true)
    login.profile?.let { app.settingsDataStore.saveAccountProfile(it.toCached()) }
    if (!app.settingsDataStore.homeTourCompleted.first()) {
        app.settingsDataStore.setHomeTourPending(true)
    }
    if (login.history.isNotEmpty()) {
        app.storyRepository.mergeHistoryEntries(login.history)
    }
    if (login.scrobbles.isNotEmpty()) {
        app.scrobbleRepository.mergeScrobbleEntries(login.scrobbles)
    }
    val url = app.settingsDataStore.backendUrl.first()
    if (url.isNotBlank()) {
        app.syncAccountDataWithServer(url)
    }
}

private fun authMessageColor(context: Context, message: String): Color {
    val successSent = context.getString(R.string.settings_auth_code_sent)
    val successLogin = context.getString(R.string.settings_auth_success)
    return if (message == successSent || message == successLogin) LiveGreen else ErrorCoral
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
    var showTelegramSheet by remember { mutableStateOf(false) }
    var backendUrl by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        val url = app.settingsDataStore.backendUrl.first()
        backendUrl = url
        app.settingsDataStore.readCachedAccountProfile()?.toProfile()?.let { profile = it }
        if (url.isNotBlank()) {
            authConfig = app.accountAuthManager.fetchConfig(url)
            app.accountAuthManager.fetchProfile(url)?.let { fresh ->
                profile = fresh
                app.settingsDataStore.saveAccountProfile(fresh.toCached())
            }
        }
    }

    authConfig?.let { cfg ->
        if (showTelegramSheet && !cfg.telegramBotUsername.isNullOrBlank() && !cfg.telegramWidgetBaseUrl.isNullOrBlank()) {
            TelegramLoginWidgetSheet(
                visible = true,
                botUsername = cfg.telegramBotUsername,
                widgetBaseUrl = cfg.telegramWidgetBaseUrl,
                onDismiss = { showTelegramSheet = false },
                onAuthPayload = { payload ->
                    scope.launch {
                        val login = app.accountAuthManager.linkTelegram(backendUrl, payload)
                        if (login.profile != null) {
                            finishAccountLogin(app, login)
                            message = context.getString(R.string.settings_auth_success)
                            showTelegramSheet = false
                            profile = login.profile
                        } else {
                            message = login.error ?: context.getString(R.string.settings_auth_verify_failed)
                        }
                    }
                },
            )
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
                Text(text = email, style = MaterialTheme.typography.bodyMedium, color = CreamText)
            }
            p.telegramUsername?.let { username ->
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "@$username", style = MaterialTheme.typography.bodyMedium, color = CreamText)
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
                            app.accountAuthManager.fetchProfile(backendUrl)?.let { fresh ->
                                profile = fresh
                                app.settingsDataStore.saveAccountProfile(fresh.toCached())
                            }
                        }
                    },
                )
            }

            if (p.telegramId == null && authConfig?.telegramEnabled == true) {
                Spacer(modifier = Modifier.height(12.dp))
                SecondaryStoryButton(
                    text = context.getString(R.string.settings_auth_link_telegram),
                    onClick = { showTelegramSheet = true },
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
                color = authMessageColor(context, it),
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
    var agreePrivacy by remember { mutableStateOf(false) }

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

        AuthPrivacyConsentRow(
            checked = agreePrivacy,
            onCheckedChange = { agreePrivacy = it },
            enabled = !busy,
        )
        Spacer(modifier = Modifier.height(8.dp))

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
                    if (!agreePrivacy) {
                        message = context.getString(R.string.auth_privacy_required)
                        return@PrimaryStoryButton
                    }
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
                    if (!agreePrivacy) {
                        message = context.getString(R.string.auth_privacy_required)
                        return@PrimaryStoryButton
                    }
                    scope.launch {
                        busy = true
                        message = null
                        val url = app.settingsDataStore.backendUrl.first()
                        val login = app.accountAuthManager.verifyEmailLogin(url, email, code)
                        if (login.profile != null) {
                            finishAccountLogin(app, login)
                            message = context.getString(R.string.settings_auth_success)
                            onLoggedIn()
                        } else {
                            message = login.error ?: context.getString(R.string.settings_auth_verify_failed)
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
                color = authMessageColor(context, it),
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
    var authConfig by remember { mutableStateOf<AccountAuthManager.AuthConfig?>(null) }
    var backendUrl by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var showSheet by remember { mutableStateOf(false) }
    var agreePrivacy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        backendUrl = app.settingsDataStore.backendUrl.first()
        if (backendUrl.isNotBlank()) {
            authConfig = app.accountAuthManager.fetchConfig(backendUrl)
        }
    }

    authConfig?.let { cfg ->
        if (showSheet && !cfg.telegramBotUsername.isNullOrBlank() && !cfg.telegramWidgetBaseUrl.isNullOrBlank()) {
            TelegramLoginWidgetSheet(
                visible = true,
                botUsername = cfg.telegramBotUsername,
                widgetBaseUrl = cfg.telegramWidgetBaseUrl,
                onDismiss = { showSheet = false },
                onAuthPayload = { payload ->
                    scope.launch {
                        val login = app.accountAuthManager.linkTelegram(backendUrl, payload)
                        if (login.profile != null) {
                            finishAccountLogin(app, login)
                            message = context.getString(R.string.settings_auth_success)
                            showSheet = false
                            onLoggedIn()
                        } else {
                            message = login.error ?: context.getString(R.string.settings_auth_verify_failed)
                        }
                    }
                },
            )
        }
    }

    Column(modifier = modifier) {
        Text(
            text = context.getString(R.string.settings_auth_telegram_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MutedLavender,
        )
        Spacer(modifier = Modifier.height(12.dp))
        AuthPrivacyConsentRow(
            checked = agreePrivacy,
            onCheckedChange = { agreePrivacy = it },
        )
        Spacer(modifier = Modifier.height(12.dp))
        PrimaryStoryButton(
            text = context.getString(R.string.settings_auth_telegram),
            onClick = {
                if (!agreePrivacy) {
                    message = context.getString(R.string.auth_privacy_required)
                    return@PrimaryStoryButton
                }
                if (authConfig?.telegramWidgetBaseUrl.isNullOrBlank()) {
                    message = context.getString(R.string.settings_auth_telegram_not_configured)
                } else {
                    showSheet = true
                }
            },
        )
        message?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = authMessageColor(context, it),
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
