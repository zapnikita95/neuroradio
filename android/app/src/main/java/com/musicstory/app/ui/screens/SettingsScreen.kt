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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.domain.TriggerMode
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.SectionLabel
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.ui.theme.SurfaceGlass
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val scope = rememberCoroutineScope()
    val settings = app.settingsDataStore

    val manualMode by settings.manualMode.collectAsState(initial = false)
    val autoIntercept by settings.autoIntercept.collectAsState(initial = SettingsDataStore.DEFAULT_AUTO_INTERCEPT)
    val everyN by settings.everyNTracks.collectAsState(initial = SettingsDataStore.DEFAULT_EVERY_N_TRACKS)
    val backendUrl by settings.backendUrl.collectAsState(initial = SettingsDataStore.DEFAULT_BACKEND_URL)
    val groqApiKey by settings.groqApiKey.collectAsState(initial = "")
    val sameTrackEveryN by settings.sameTrackStoryEveryN.collectAsState(
        initial = SettingsDataStore.DEFAULT_SAME_TRACK_STORY_EVERY_N,
    )
    val triggerMode by settings.triggerMode.collectAsState(initial = TriggerMode.EVERY_N_TRACKS)

    var urlInput by remember(backendUrl) { mutableStateOf(backendUrl) }
    var groqInput by remember(groqApiKey) { mutableStateOf(groqApiKey) }
    var nInput by remember(everyN) { mutableStateOf(everyN.toString()) }
    var sameTrackInput by remember(sameTrackEveryN) { mutableStateOf(sameTrackEveryN.toString()) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = GoldBright,
        unfocusedBorderColor = GoldWarm.copy(alpha = 0.35f),
        focusedLabelColor = GoldBright,
        cursorColor = GoldBright,
        focusedTextColor = CreamText,
        unfocusedTextColor = CreamText,
    )

    MusicStoryBackground(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text(context.getString(R.string.settings_title), style = MaterialTheme.typography.titleLarge) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = context.getString(R.string.action_back), tint = GoldBright)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DeepVoid.copy(alpha = 0.65f)),
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                GlassCard {
                    SectionLabel(text = "Режим")
                    Spacer(modifier = Modifier.height(8.dp))
                    SettingSwitchRow(
                        title = context.getString(R.string.settings_manual_mode),
                        subtitle = context.getString(R.string.settings_manual_mode_hint),
                        checked = manualMode,
                        onCheckedChange = { scope.launch { settings.setManualMode(it) } },
                    )
                    SettingSwitchRow(
                        title = context.getString(R.string.settings_auto_intercept),
                        subtitle = context.getString(R.string.settings_auto_intercept_hint),
                        checked = autoIntercept,
                        onCheckedChange = { scope.launch { settings.setAutoIntercept(it) } },
                    )
                }

                GlassCard {
                    SectionLabel(text = context.getString(R.string.settings_trigger_mode))
                    Spacer(modifier = Modifier.height(4.dp))
                    TriggerMode.entries.forEach { mode ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = triggerMode == mode,
                                onClick = { scope.launch { settings.setTriggerMode(mode) } },
                                colors = RadioButtonDefaults.colors(selectedColor = GoldBright),
                            )
                            Text(text = triggerModeLabel(context, mode), style = MaterialTheme.typography.bodyMedium, color = CreamText)
                        }
                    }
                }

                GlassCard {
                    SectionLabel(text = "Искусственный интеллект")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (groqApiKey.isNotBlank()) {
                            context.getString(R.string.settings_groq_status_ok)
                        } else {
                            context.getString(R.string.settings_groq_status_missing)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (groqApiKey.isNotBlank()) LiveGreen else ErrorCoral,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = groqInput,
                        onValueChange = { groqInput = it },
                        label = { Text(context.getString(R.string.settings_groq_api_key)) },
                        supportingText = { Text(context.getString(R.string.settings_groq_api_key_hint), color = MutedLavender) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    SecondaryStoryButton(
                        text = context.getString(R.string.settings_groq_get_key),
                        onClick = {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse("https://console.groq.com/keys")),
                            )
                        },
                    )
                }

                GlassCard {
                    SectionLabel(text = context.getString(R.string.settings_same_track_section))
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = sameTrackInput,
                        onValueChange = { sameTrackInput = it.filter { ch -> ch.isDigit() }.take(2) },
                        label = { Text(context.getString(R.string.settings_same_track_every_n)) },
                        supportingText = {
                            Text(context.getString(R.string.settings_same_track_every_n_hint), color = MutedLavender)
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                    )
                }

                GlassCard {
                    SectionLabel(text = "Сервер")
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = nInput,
                        onValueChange = { nInput = it.filter { ch -> ch.isDigit() }.take(3) },
                        label = { Text(context.getString(R.string.settings_every_n_tracks)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        enabled = triggerMode == TriggerMode.EVERY_N_TRACKS,
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = urlInput,
                        onValueChange = { urlInput = it },
                        label = { Text(context.getString(R.string.settings_backend_url)) },
                        supportingText = { Text(context.getString(R.string.settings_backend_url_example), color = MutedLavender) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(text = context.getString(R.string.settings_backend_hint), style = MaterialTheme.typography.bodySmall)
                    Text(text = context.getString(R.string.settings_backend_auth_hint), style = MaterialTheme.typography.bodySmall, color = MutedLavender)
                    Text(text = context.getString(R.string.settings_offline_hint), style = MaterialTheme.typography.bodySmall)
                }

                GlassCard {
                    SectionLabel(text = "Отладка")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = context.getString(R.string.settings_debug_logs_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                }

                PrimaryStoryButton(
                    text = context.getString(R.string.action_save),
                    onClick = {
                        scope.launch {
                            nInput.toIntOrNull()?.let { settings.setEveryNTracks(it) }
                            sameTrackInput.toIntOrNull()?.let { settings.setSameTrackStoryEveryN(it) }
                            settings.setBackendUrl(urlInput)
                            settings.setGroqApiKey(groqInput)
                            app.backendAuthManager.invalidateToken()
                            app.apiClient.invalidateCache()
                            app.triggerEngine.resetCounter()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun SettingSwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium, color = CreamText)
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = MutedLavender)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = DeepVoid,
                checkedTrackColor = GoldBright,
                uncheckedTrackColor = SurfaceGlass,
            ),
        )
    }
}

private fun triggerModeLabel(context: android.content.Context, mode: TriggerMode): String {
    return when (mode) {
        TriggerMode.EVERY_N_TRACKS -> context.getString(R.string.trigger_every_n)
        TriggerMode.SPECIFIC_ARTISTS -> context.getString(R.string.trigger_artists)
        TriggerMode.SPECIFIC_GENRES -> context.getString(R.string.trigger_genres)
        TriggerMode.ALWAYS -> context.getString(R.string.trigger_always)
        TriggerMode.NEVER -> context.getString(R.string.trigger_never)
    }
}
