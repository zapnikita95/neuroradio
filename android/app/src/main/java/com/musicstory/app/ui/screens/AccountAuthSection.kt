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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
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

@Composable
fun AccountAuthSection(app: MusicStoryApp, scope: CoroutineScope) {
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var profile by remember { mutableStateOf<com.musicstory.app.data.remote.AccountAuthManager.AccountProfile?>(null) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = GoldBright,
        unfocusedBorderColor = GoldWarm.copy(alpha = 0.35f),
        focusedLabelColor = GoldBright,
        cursorColor = GoldBright,
        focusedTextColor = CreamText,
        unfocusedTextColor = CreamText,
    )

    LaunchedEffect(Unit) {
        val url = app.settingsDataStore.backendUrl.first()
        profile = app.accountAuthManager.fetchProfile(url)
        profile?.email?.let { email = it }
    }

    Column {
        Text(
            text = context.getString(R.string.settings_auth_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MutedLavender,
        )
        profile?.let { p ->
            if (p.isLoggedIn) {
                Spacer(modifier = Modifier.height(8.dp))
                val status = when {
                    p.plan == "premium" && (p.premiumUntil ?: 0L) > System.currentTimeMillis() ->
                        context.getString(R.string.settings_auth_premium)
                    p.plan == "trial" && (p.trialUntil ?: 0L) > System.currentTimeMillis() -> {
                        val until = SimpleDateFormat("d MMM", Locale("ru")).format(Date(p.trialUntil!!))
                        context.getString(R.string.settings_auth_trial_until, until)
                    }
                    else -> context.getString(R.string.settings_auth_linked)
                }
                Text(
                    text = status,
                    style = MaterialTheme.typography.labelMedium,
                    color = LiveGreen,
                )
                p.email?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }

        if (profile?.isLoggedIn != true) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it.trim() },
                label = { Text(context.getString(R.string.settings_auth_email)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
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
                                profile = p
                                app.settingsDataStore.setAccountLinked(true)
                                message = context.getString(R.string.settings_auth_success)
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
        }

        message?.let {
            Spacer(modifier = Modifier.height(8.dp))
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
    }
}
