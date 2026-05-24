package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardCapitalization
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

@Composable
fun SyncDevicesSection(app: MusicStoryApp, scope: CoroutineScope) {
    val context = LocalContext.current
    var syncCode by remember { mutableStateOf("") }
    var linkInput by remember { mutableStateOf("") }
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

    Column {
        Text(
            text = context.getString(R.string.settings_sync_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MutedLavender,
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = syncCode.ifBlank { "—" },
            onValueChange = {},
            readOnly = true,
            label = { Text(context.getString(R.string.settings_sync_your_code)) },
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors,
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(modifier = Modifier.height(8.dp))
        SecondaryStoryButton(
            text = context.getString(R.string.settings_sync_create_code),
            onClick = {
                if (busy) return@SecondaryStoryButton
                scope.launch {
                    busy = true
                    message = null
                    val url = app.settingsDataStore.backendUrl.first()
                    val code = app.accountSyncManager.createAccount(url)
                    if (code != null) {
                        syncCode = code
                        app.settingsDataStore.setSyncCode(code)
                        message = context.getString(R.string.settings_sync_code_created, code)
                    } else {
                        message = context.getString(R.string.settings_sync_error)
                    }
                    busy = false
                }
            },
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = linkInput,
            onValueChange = { linkInput = it.uppercase() },
            label = { Text(context.getString(R.string.settings_sync_link_code)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                keyboardType = KeyboardType.Ascii,
            ),
            colors = fieldColors,
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(modifier = Modifier.height(8.dp))
        PrimaryStoryButton(
            text = context.getString(R.string.settings_sync_link_action),
            onClick = {
                if (busy || linkInput.isBlank()) return@PrimaryStoryButton
                scope.launch {
                    busy = true
                    message = null
                    val url = app.settingsDataStore.backendUrl.first()
                    val ok = app.accountSyncManager.linkAccount(url, linkInput)
                    if (ok) {
                        app.settingsDataStore.setAccountLinked(true)
                        linkInput = ""
                        message = context.getString(R.string.settings_sync_linked)
                    } else {
                        message = context.getString(R.string.settings_sync_link_failed)
                    }
                    busy = false
                }
            },
        )
        message?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = if (it.contains("ошиб", ignoreCase = true) || it.contains("не ", ignoreCase = true)) {
                    ErrorCoral
                } else {
                    LiveGreen
                },
            )
        }
    }
}
