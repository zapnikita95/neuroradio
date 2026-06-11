package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import android.app.Activity
import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.auth.TelegramOAuthCoordinator
import com.musicstory.app.data.auth.TelegramOAuthException
import com.musicstory.app.data.local.toCached
import com.musicstory.app.data.local.toProfile
import com.musicstory.app.data.remote.AccountAuthManager
import com.musicstory.app.ui.components.AuthPrivacyConsentRow
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.TelegramLoginWidgetSheet
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val EMAIL_CODE_RESEND_COOLDOWN_SEC = 20
private const val LOGIN_BACKGROUND_SYNC_TIMEOUT_MS = 25_000L

/** Быстро сохраняет сессию локально — без сетевого push (не блокирует переход на HOME). */
private suspend fun persistAccountLogin(
    app: MusicStoryApp,
    login: AccountAuthManager.AccountLoginResult,
) {
    runCatching {
        app.settingsDataStore.setAccountLinked(true)
        login.profile?.let { app.settingsDataStore.saveAccountProfile(it.toCached()) }
        if (!app.settingsDataStore.homeTourCompleted.first()) {
            app.settingsDataStore.setHomeTourPending(true)
        }
    }.onFailure { err ->
        StoryLog.e("Account login: settings persist failed", err)
        throw err
    }
    runCatching {
        if (login.history.isNotEmpty()) {
            app.storyRepository.mergeHistoryEntries(login.history)
        }
        if (login.scrobbles.isNotEmpty()) {
            app.scrobbleRepository.mergeScrobbleEntries(login.scrobbles)
        }
        app.storyRepository.dedupeStoryHistory()
    }.onFailure { err ->
        StoryLog.e("Account login: cloud merge failed (login kept)", err)
    }
}

/** Push истории/настроек на сервер — в фоне, с таймаутом (не держит кнопку «Войти»). */
private fun scheduleAccountLoginSync(app: MusicStoryApp) {
    app.appScope.launch {
        val url = runCatching { app.settingsDataStore.backendUrl.first() }.getOrNull()?.trim().orEmpty()
        if (url.isBlank()) return@launch
        runCatching {
            withTimeout(LOGIN_BACKGROUND_SYNC_TIMEOUT_MS) {
                app.syncAccountDataWithServer(url)
                app.storyRepository.dedupeStoryHistory()
            }
        }.onFailure { err ->
            StoryLog.e("Account login: background sync failed (login kept)", err)
        }
    }
}

private suspend fun finishAccountLogin(
    app: MusicStoryApp,
    login: AccountAuthManager.AccountLoginResult,
) {
    persistAccountLogin(app, login)
    scheduleAccountLoginSync(app)
}

private fun authMessageColor(context: Context, message: String): Color {
    val successSent = context.getString(R.string.settings_auth_code_sent)
    val successLogin = context.getString(R.string.settings_auth_success)
    val successLogout = context.getString(R.string.settings_auth_logout_done)
    return if (message == successSent || message == successLogin || message == successLogout) {
        LiveGreen
    } else {
        ErrorCoral
    }
}

private fun CoroutineScope.launchTelegramAuth(
    app: MusicStoryApp,
    context: Context,
    backendUrl: String,
    cfg: AccountAuthManager.AuthConfig,
    onSuccess: (AccountAuthManager.AccountProfile) -> Unit,
    onError: (String) -> Unit,
    onWidgetFallback: () -> Unit,
) {
    launch {
        if (cfg.canUseTelegramOAuth) {
            val activity = context as? Activity
            if (activity == null) {
                onError(context.getString(R.string.settings_auth_verify_failed))
                return@launch
            }
            val botId = cfg.telegramBotId.orEmpty()
            val redirectUri = TelegramOAuthCoordinator.resolveRedirectUri(cfg.telegramOAuthRedirectUri)
            try {
                val (code, verifier) = TelegramOAuthCoordinator.instance.signIn(
                    activity,
                    botId,
                    redirectUri,
                    backendUrl,
                )
                val login = withContext(Dispatchers.IO) {
                    app.accountAuthManager.linkTelegramOAuth(
                        backendUrl,
                        code,
                        verifier,
                        redirectUri,
                        context,
                    )
                }
                if (login.profile != null) {
                    withContext(Dispatchers.IO) {
                        finishAccountLogin(app, login)
                    }
                    onSuccess(login.profile)
                } else {
                    onError(login.error ?: context.getString(R.string.settings_auth_verify_failed))
                }
            } catch (err: TelegramOAuthException) {
                if (err !is TelegramOAuthException.Cancelled) {
                    onError(err.message ?: context.getString(R.string.settings_auth_verify_failed))
                }
            } catch (err: Exception) {
                StoryLog.e("Telegram OAuth failed", err)
                onError(err.message ?: context.getString(R.string.settings_auth_verify_failed))
            }
            return@launch
        }

        if (!cfg.telegramBotUsername.isNullOrBlank() && !cfg.telegramWidgetBaseUrl.isNullOrBlank()) {
            onWidgetFallback()
        } else {
            onError(context.getString(R.string.settings_auth_telegram_not_configured))
        }
    }
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
    var showLogoutConfirm by remember { mutableStateOf(false) }
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
        if (showTelegramSheet && !cfg.canUseTelegramOAuth &&
            !cfg.telegramBotUsername.isNullOrBlank() && !cfg.telegramWidgetBaseUrl.isNullOrBlank()
        ) {
            TelegramLoginWidgetSheet(
                visible = true,
                botUsername = cfg.telegramBotUsername,
                widgetBaseUrl = cfg.telegramWidgetBaseUrl,
                onDismiss = { showTelegramSheet = false },
                onAuthPayload = { payload ->
                    scope.launch {
                        try {
                            val login = withContext(Dispatchers.IO) {
                                app.accountAuthManager.linkTelegram(backendUrl, payload, context)
                            }
                            if (login.profile != null) {
                                withContext(Dispatchers.IO) {
                                    finishAccountLogin(app, login)
                                }
                                message = context.getString(R.string.settings_auth_success)
                                showTelegramSheet = false
                                profile = login.profile
                            } else {
                                message = login.error ?: context.getString(R.string.settings_auth_verify_failed)
                            }
                        } catch (err: Exception) {
                            StoryLog.e("Telegram link failed", err)
                            message = err.message ?: context.getString(R.string.settings_auth_verify_failed)
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
            SecondaryStoryButton(
                text = context.getString(R.string.settings_auth_logout),
                onClick = { showLogoutConfirm = true },
                modifier = Modifier.fillMaxWidth(),
            )

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

            if (p.telegramId == null && authConfig?.showsTelegramLogin == true) {
                Spacer(modifier = Modifier.height(12.dp))
                SecondaryStoryButton(
                    text = context.getString(R.string.settings_auth_link_telegram),
                    onClick = {
                        val cfg = authConfig ?: return@SecondaryStoryButton
                        scope.launchTelegramAuth(
                            app = app,
                            context = context,
                            backendUrl = backendUrl,
                            cfg = cfg,
                            onSuccess = { fresh ->
                                message = context.getString(R.string.settings_auth_success)
                                profile = fresh
                            },
                            onError = { message = it },
                            onWidgetFallback = { showTelegramSheet = true },
                        )
                    },
                )
            }
        } ?: run {
            profile?.takeIf {
                it.plan == "trial" && (it.trialUntil ?: 0L) > System.currentTimeMillis()
            }?.let { p ->
                Text(
                    text = accountStatusText(context, p),
                    style = MaterialTheme.typography.labelMedium,
                    color = LiveGreen,
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            Text(
                text = context.getString(R.string.settings_auth_not_linked),
                style = MaterialTheme.typography.bodyMedium,
                color = MutedLavender,
            )
            Spacer(modifier = Modifier.height(12.dp))
            if (authConfig?.emailEnabled != false) {
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
                                app.settingsDataStore.setAccountLinked(true)
                            }
                        }
                    },
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            AccountTelegramLoginSection(
                app = app,
                scope = scope,
                onLoggedIn = {
                    scope.launch {
                        app.accountAuthManager.fetchProfile(backendUrl)?.let { fresh ->
                            profile = fresh
                            app.settingsDataStore.saveAccountProfile(fresh.toCached())
                            app.settingsDataStore.setAccountLinked(true)
                        }
                    }
                },
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

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text(context.getString(R.string.settings_auth_logout_confirm_title)) },
            text = { Text(context.getString(R.string.settings_auth_logout_confirm_body)) },
            confirmButton = {
                PrimaryStoryButton(
                    text = context.getString(R.string.settings_auth_logout),
                    onClick = {
                        scope.launch {
                            app.settingsDataStore.clearAccountSession()
                            profile = null
                            message = context.getString(R.string.settings_auth_logout_done)
                            showLogoutConfirm = false
                        }
                    },
                )
            },
            dismissButton = {
                SecondaryStoryButton(
                    text = context.getString(R.string.action_cancel),
                    onClick = { showLogoutConfirm = false },
                )
            },
            containerColor = DeepVoid,
            titleContentColor = CreamText,
            textContentColor = MutedLavender,
        )
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
    var resendCooldown by remember { mutableStateOf(0) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var agreePrivacy by remember { mutableStateOf(false) }

    LaunchedEffect(resendCooldown) {
        if (resendCooldown <= 0) return@LaunchedEffect
        delay(1_000)
        resendCooldown = (resendCooldown - 1).coerceAtLeast(0)
    }

    suspend fun sendEmailCode() {
        busy = true
        message = null
        val url = app.settingsDataStore.backendUrl.first()
        val err = app.accountAuthManager.startEmailLogin(url, email)
        if (err == null) {
            codeSent = true
            resendCooldown = EMAIL_CODE_RESEND_COOLDOWN_SEC
            message = context.getString(R.string.settings_auth_code_sent)
        } else {
            message = err
        }
        busy = false
    }

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
                loading = busy,
                onClick = {
                    if (busy || email.isBlank()) return@PrimaryStoryButton
                    if (!agreePrivacy) {
                        message = context.getString(R.string.auth_privacy_required)
                        return@PrimaryStoryButton
                    }
                    scope.launch { sendEmailCode() }
                },
            )
        } else {
            OutlinedTextField(
                value = code,
                onValueChange = { raw ->
                    code = raw.filter { ch -> ch.isDigit() }.take(6)
                },
                label = { Text(context.getString(R.string.settings_auth_code)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                colors = fieldColors,
                shape = RoundedCornerShape(14.dp),
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = {
                        if (busy || resendCooldown > 0) return@TextButton
                        if (!agreePrivacy) {
                            message = context.getString(R.string.auth_privacy_required)
                            return@TextButton
                        }
                        scope.launch { sendEmailCode() }
                    },
                    enabled = !busy && resendCooldown == 0,
                ) {
                    Text(
                        text = if (resendCooldown > 0) {
                            context.getString(R.string.settings_auth_resend_in, resendCooldown)
                        } else {
                            context.getString(R.string.settings_auth_resend_code)
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = if (resendCooldown > 0) MutedLavender else GoldBright,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                TextButton(
                    onClick = {
                        if (busy) return@TextButton
                        codeSent = false
                        code = ""
                        resendCooldown = 0
                        message = null
                    },
                    enabled = !busy,
                ) {
                    Text(
                        text = context.getString(R.string.settings_auth_change_email),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            PrimaryStoryButton(
                text = context.getString(R.string.settings_auth_verify),
                loading = busy,
                onClick = {
                    if (busy || code.length < 4) return@PrimaryStoryButton
                    if (!agreePrivacy) {
                        message = context.getString(R.string.auth_privacy_required)
                        return@PrimaryStoryButton
                    }
                    scope.launch {
                        busy = true
                        message = null
                        try {
                            val login = withContext(Dispatchers.IO) {
                                val url = app.settingsDataStore.backendUrl.first()
                                app.accountAuthManager.verifyEmailLogin(url, email, code, context)
                            }
                            if (login.profile != null) {
                                withContext(Dispatchers.IO) {
                                    persistAccountLogin(app, login)
                                }
                                scheduleAccountLoginSync(app)
                                onLoggedIn()
                            } else {
                                message = login.error ?: context.getString(R.string.settings_auth_verify_failed)
                            }
                        } catch (err: Exception) {
                            StoryLog.e("Email verify failed", err)
                            message = err.message?.takeIf { it.isNotBlank() }
                                ?: context.getString(R.string.settings_auth_verify_failed)
                        } finally {
                            busy = false
                        }
                    }
                },
            )
        }

        message?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = authMessageColor(context, it),
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Start,
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
        if (showSheet && !cfg.canUseTelegramOAuth &&
            !cfg.telegramBotUsername.isNullOrBlank() && !cfg.telegramWidgetBaseUrl.isNullOrBlank()
        ) {
            TelegramLoginWidgetSheet(
                visible = true,
                botUsername = cfg.telegramBotUsername,
                widgetBaseUrl = cfg.telegramWidgetBaseUrl,
                onDismiss = { showSheet = false },
                onAuthPayload = { payload ->
                    scope.launch {
                        try {
                            val login = withContext(Dispatchers.IO) {
                                app.accountAuthManager.linkTelegram(backendUrl, payload, context)
                            }
                            if (login.profile != null) {
                                withContext(Dispatchers.IO) {
                                    finishAccountLogin(app, login)
                                }
                                message = context.getString(R.string.settings_auth_success)
                                showSheet = false
                                onLoggedIn()
                            } else {
                                message = login.error ?: context.getString(R.string.settings_auth_verify_failed)
                            }
                        } catch (err: Exception) {
                            StoryLog.e("Telegram login failed", err)
                            message = err.message ?: context.getString(R.string.settings_auth_verify_failed)
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
                val cfg = authConfig
                if (cfg == null || !cfg.showsTelegramLogin) {
                    message = context.getString(R.string.settings_auth_telegram_not_configured)
                    return@PrimaryStoryButton
                }
                scope.launchTelegramAuth(
                    app = app,
                    context = context,
                    backendUrl = backendUrl,
                    cfg = cfg,
                    onSuccess = {
                        message = context.getString(R.string.settings_auth_success)
                        onLoggedIn()
                    },
                    onError = { message = it },
                    onWidgetFallback = { showSheet = true },
                )
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
