package com.musicstory.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.remote.ConnectionCheckResult
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.domain.TriggerMode
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.ScrobblePickList
import com.musicstory.app.ui.components.SectionLabel
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.LiveGreen
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.ui.theme.SurfaceGlass
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
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
    val groqApiKey by settings.groqApiKey.collectAsState(initial = "")
    val geminiApiKey by settings.geminiApiKey.collectAsState(initial = "")
    val llmProvider by settings.llmProvider.collectAsState(initial = LlmProvider.GROQ)
    val geminiModel by settings.geminiModel.collectAsState(initial = GeminiModel.defaultRecommended)
    val sameTrackEveryN by settings.sameTrackStoryEveryN.collectAsState(
        initial = SettingsDataStore.DEFAULT_SAME_TRACK_STORY_EVERY_N,
    )
    val triggerMode by settings.triggerMode.collectAsState(initial = TriggerMode.EVERY_N_TRACKS)
    val specificArtists by settings.specificArtists.collectAsState(initial = emptySet())
    val specificGenres by settings.specificGenres.collectAsState(initial = emptySet())
    val scrobbledArtists by app.scrobbleRepository.topArtists().collectAsState(initial = emptyList())
    val scrobbledGenres by app.scrobbleRepository.topGenres().collectAsState(initial = emptyList())
    val dailyQuota by app.storyRepository.dailyQuota.collectAsState(initial = null)
    val storyLength by settings.storyLength.collectAsState(initial = StoryLength.SEC_30)
    val storyNarrator by settings.storyNarrator.collectAsState(initial = StoryNarrator.AUTO)
    val ttsVoice by settings.ttsVoice.collectAsState(initial = TtsVoice.AUTO)
    val ttsSpeed by settings.ttsSpeed.collectAsState(initial = TtsSpeed.NORMAL)
    val ttsEmotion by settings.ttsEmotion.collectAsState(initial = TtsEmotion.LIVELY)

    var groqInput by remember(groqApiKey) { mutableStateOf(groqApiKey) }
    var geminiInput by remember(geminiApiKey) { mutableStateOf(geminiApiKey) }
    var nInput by remember(everyN) { mutableStateOf(everyN.toString()) }
    var sameTrackInput by remember(sameTrackEveryN) { mutableStateOf(sameTrackEveryN.toString()) }

    var isChecking by remember { mutableStateOf(false) }
    var checkResult by remember { mutableStateOf<ConnectionCheckResult?>(null) }
    var checkSummary by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    var saveFeedback by remember { mutableStateOf<String?>(null) }

    val activeApiKey = when (llmProvider) {
        LlmProvider.GROQ -> groqApiKey
        LlmProvider.GEMINI -> geminiApiKey
    }
    val activeApiInput = when (llmProvider) {
        LlmProvider.GROQ -> groqInput
        LlmProvider.GEMINI -> geminiInput
    }

    val hasPendingChanges = remember(
        groqInput,
        groqApiKey,
        geminiInput,
        geminiApiKey,
        llmProvider,
        nInput,
        everyN,
        sameTrackInput,
        sameTrackEveryN,
        triggerMode,
    ) {
        groqInput.trim() != groqApiKey.trim() ||
            geminiInput.trim() != geminiApiKey.trim() ||
            sameTrackInput.toIntOrNull() != sameTrackEveryN ||
            (triggerMode == TriggerMode.EVERY_N_TRACKS && nInput.toIntOrNull() != everyN)
    }

    LaunchedEffect(groqApiKey, geminiApiKey, llmProvider) {
        val hasOwnKey = when (llmProvider) {
            LlmProvider.GROQ -> groqApiKey.isNotBlank()
            LlmProvider.GEMINI -> geminiApiKey.isNotBlank()
        }
        if (!hasOwnKey) {
            app.storyRepository.refreshQuota()
        }
    }

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
                val modeSummary = if (manualMode) {
                    context.getString(R.string.mode_manual)
                } else {
                    context.getString(R.string.mode_auto)
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_mode_section),
                    summary = modeSummary,
                ) {
                    SettingSwitchRow(
                        title = context.getString(R.string.settings_manual_mode),
                        checked = manualMode,
                        onCheckedChange = { scope.launch { settings.setManualMode(it) } },
                    )
                    SettingSwitchRow(
                        title = context.getString(R.string.settings_auto_intercept),
                        checked = autoIntercept,
                        onCheckedChange = { scope.launch { settings.setAutoIntercept(it) } },
                    )
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_sync_section),
                    summary = context.getString(R.string.settings_sync_summary),
                ) {
                    SyncDevicesSection(app = app, scope = scope)
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_trigger_mode),
                    summary = buildTriggerSummary(
                        context = context,
                        triggerMode = triggerMode,
                        specificArtists = specificArtists,
                        specificGenres = specificGenres,
                    ),
                    initiallyExpanded = triggerMode == TriggerMode.SPECIFIC_ARTISTS ||
                        triggerMode == TriggerMode.SPECIFIC_GENRES,
                ) {
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
                    if (triggerMode == TriggerMode.EVERY_N_TRACKS) {
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = nInput,
                            onValueChange = { nInput = it.filter { ch -> ch.isDigit() }.take(3) },
                            label = { Text(context.getString(R.string.settings_every_n_tracks)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                    }
                    if (triggerMode == TriggerMode.SPECIFIC_ARTISTS) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_pick_artists),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        ScrobblePickList(
                            items = scrobbledArtists.map { it.artist },
                            selected = specificArtists,
                            emptyHint = context.getString(R.string.settings_pick_empty_artists),
                            onToggle = { artist ->
                                scope.launch {
                                    val current = settings.specificArtists.first()
                                    val next = if (current.any { it.equals(artist, ignoreCase = true) }) {
                                        current.filterNot { it.equals(artist, ignoreCase = true) }.toSet()
                                    } else {
                                        current + artist
                                    }
                                    settings.setSpecificArtists(next)
                                }
                            },
                            subtitleFor = { artist ->
                                val stat = scrobbledArtists.find { it.artist == artist }
                                stat?.let { context.getString(R.string.listening_play_count, it.playCount) }
                            },
                        )
                    }
                    if (triggerMode == TriggerMode.SPECIFIC_GENRES) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_pick_genres),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                        ScrobblePickList(
                            items = scrobbledGenres.map { it.genre },
                            selected = specificGenres,
                            emptyHint = context.getString(R.string.settings_pick_empty_genres),
                            onToggle = { genre ->
                                scope.launch {
                                    val current = settings.specificGenres.first()
                                    val next = if (current.any { it.equals(genre, ignoreCase = true) }) {
                                        current.filterNot { it.equals(genre, ignoreCase = true) }.toSet()
                                    } else {
                                        current + genre
                                    }
                                    settings.setSpecificGenres(next)
                                }
                            },
                            subtitleFor = { genre ->
                                val stat = scrobbledGenres.find { it.genre == genre }
                                stat?.let { context.getString(R.string.listening_play_count, it.playCount) }
                            },
                        )
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_same_track_section),
                    summary = context.getString(R.string.settings_same_track_every_n) + ": $sameTrackEveryN",
                ) {
                    OutlinedTextField(
                        value = sameTrackInput,
                        onValueChange = { sameTrackInput = it.filter { ch -> ch.isDigit() }.take(2) },
                        label = { Text(context.getString(R.string.settings_same_track_every_n)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                    )
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_narrator_section),
                    summary = storyNarrator.labelRu,
                ) {
                    StoryNarrator.entries.forEach { narrator ->
                        NarratorRadioRow(
                            label = narrator.labelRu,
                            description = narrator.descriptionRu,
                            selected = storyNarrator == narrator,
                            onSelect = { scope.launch { settings.setStoryNarrator(narrator) } },
                        )
                    }
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_voice_section),
                    summary = "${ttsVoice.labelRu} · ${ttsSpeed.labelRu} · ${storyLength.labelRu}",
                ) {
                    Text(
                        text = context.getString(R.string.settings_tts_voice),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    TtsVoice.entries.forEach { voice ->
                        NarratorRadioRow(
                            label = voice.labelRu,
                            description = voice.descriptionRu,
                            selected = ttsVoice == voice,
                            onSelect = { scope.launch { settings.setTtsVoice(voice) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = context.getString(R.string.settings_tts_emotion),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    TtsEmotion.entries.forEach { emotion ->
                        NarratorRadioRow(
                            label = emotion.labelRu,
                            description = emotion.descriptionRu,
                            selected = ttsEmotion == emotion,
                            onSelect = { scope.launch { settings.setTtsEmotion(emotion) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = context.getString(R.string.settings_tts_speed),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    TtsSpeed.entries.forEach { speed ->
                        PreferenceRadioRow(
                            label = speed.labelRu,
                            selected = ttsSpeed == speed,
                            onSelect = { scope.launch { settings.setTtsSpeed(speed) } },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = context.getString(R.string.settings_story_length),
                        style = MaterialTheme.typography.labelMedium,
                        color = MutedLavender,
                    )
                    StoryLength.entries.forEach { length ->
                        PreferenceRadioRow(
                            label = length.labelRu,
                            selected = storyLength == length,
                            onSelect = { scope.launch { settings.setStoryLength(length) } },
                        )
                    }
                }

                val aiSummary = if (activeApiKey.isNotBlank()) {
                    when (llmProvider) {
                        LlmProvider.GEMINI -> "${llmProvider.labelRu}: ${geminiModel.settingsLabelRu}"
                        LlmProvider.GROQ -> "${llmProvider.labelRu}: ${context.getString(R.string.settings_groq_status_ok)}"
                    }
                } else {
                    dailyQuota?.let { quota ->
                        context.getString(R.string.settings_free_quota, quota.remaining, quota.limit)
                    } ?: context.getString(R.string.settings_groq_status_missing)
                }

                CollapsibleSettingsSection(
                    title = context.getString(R.string.settings_ai_section),
                    summary = aiSummary,
                    initiallyExpanded = true,
                ) {
                    var providerMenuExpanded by remember { mutableStateOf(false) }
                    var geminiModelMenuExpanded by remember { mutableStateOf(false) }

                    Text(
                        text = context.getString(R.string.settings_llm_provider_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    ExposedDropdownMenuBox(
                        expanded = providerMenuExpanded,
                        onExpandedChange = { providerMenuExpanded = it },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        OutlinedTextField(
                            value = llmProvider.labelRu,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(context.getString(R.string.settings_llm_provider)) },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = providerMenuExpanded)
                            },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                            colors = fieldColors,
                            shape = RoundedCornerShape(14.dp),
                        )
                        DropdownMenu(
                            expanded = providerMenuExpanded,
                            onDismissRequest = { providerMenuExpanded = false },
                        ) {
                            LlmProvider.entries.forEach { provider ->
                                DropdownMenuItem(
                                    text = { Text(provider.labelRu, color = CreamText) },
                                    onClick = {
                                        providerMenuExpanded = false
                                        scope.launch { settings.setLlmProvider(provider) }
                                    },
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = context.getString(R.string.settings_llm_active, llmProvider.labelRu),
                        style = MaterialTheme.typography.labelMedium,
                        color = GoldBright,
                    )
                    if (llmProvider == LlmProvider.GEMINI) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = context.getString(R.string.settings_gemini_model_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = geminiModelMenuExpanded,
                            onExpandedChange = { geminiModelMenuExpanded = it },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            OutlinedTextField(
                                value = geminiModel.settingsLabelRu,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(context.getString(R.string.settings_gemini_model)) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = geminiModelMenuExpanded)
                                },
                                modifier = Modifier
                                    .menuAnchor()
                                    .fillMaxWidth(),
                                colors = fieldColors,
                                shape = RoundedCornerShape(14.dp),
                            )
                            DropdownMenu(
                                expanded = geminiModelMenuExpanded,
                                onDismissRequest = { geminiModelMenuExpanded = false },
                            ) {
                                GeminiModel.entries.forEach { model ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(model.settingsLabelRu, color = CreamText)
                                                Text(
                                                    model.descriptionRu,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MutedLavender,
                                                )
                                            }
                                        },
                                        onClick = {
                                            geminiModelMenuExpanded = false
                                            scope.launch { settings.setGeminiModel(model) }
                                        },
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = context.getString(
                                R.string.settings_gemini_paid_models,
                                GeminiModel.paidReferences.joinToString(", ") { it.labelRu },
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                        Text(
                            text = context.getString(R.string.settings_gemini_pricing_link),
                            style = MaterialTheme.typography.labelMedium,
                            color = GoldBright,
                            modifier = Modifier
                                .padding(top = 4.dp)
                                .clickable {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW, Uri.parse("https://ai.google.dev/pricing")),
                                    )
                                },
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (activeApiKey.isNotBlank()) {
                            context.getString(R.string.settings_groq_status_ok)
                        } else {
                            context.getString(R.string.settings_groq_status_missing)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (activeApiKey.isNotBlank()) LiveGreen else MutedLavender,
                    )
                    if (activeApiKey.isNotBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = context.getString(R.string.settings_own_api_key_hint),
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedLavender,
                        )
                    }
                    if (activeApiKey.isBlank()) {
                        dailyQuota?.let { quota ->
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = context.getString(
                                    R.string.settings_free_quota,
                                    quota.remaining,
                                    quota.limit,
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                color = GoldBright,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = activeApiInput,
                        onValueChange = { value ->
                            when (llmProvider) {
                                LlmProvider.GROQ -> groqInput = value
                                LlmProvider.GEMINI -> geminiInput = value
                            }
                        },
                        label = { Text(context.getString(R.string.settings_api_key)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        colors = fieldColors,
                        shape = RoundedCornerShape(14.dp),
                        trailingIcon = {
                            if (activeApiInput.isNotEmpty()) {
                                IconButton(
                                    onClick = {
                                        when (llmProvider) {
                                            LlmProvider.GROQ -> groqInput = ""
                                            LlmProvider.GEMINI -> geminiInput = ""
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Clear,
                                        contentDescription = context.getString(R.string.settings_api_key_clear),
                                        tint = MutedLavender,
                                    )
                                }
                            }
                        },
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    PrimaryStoryButton(
                        text = if (isChecking) {
                            context.getString(R.string.settings_groq_checking)
                        } else {
                            context.getString(R.string.settings_groq_save_test)
                        },
                        onClick = {
                            if (isChecking) return@PrimaryStoryButton
                            scope.launch {
                                isChecking = true
                                checkResult = null
                                checkSummary = null
                                settings.setGroqApiKey(groqInput)
                                settings.setGeminiApiKey(geminiInput)
                                val backendUrl = settings.backendUrl.first()
                                app.backendAuthManager.invalidateToken()
                                app.apiClient.invalidateCache()
                                val result = app.storyRepository.checkConnections(
                                    llmProvider = llmProvider,
                                    groqApiKey = groqInput,
                                    geminiApiKey = geminiInput,
                                    geminiModel = geminiModel,
                                    backendUrl = backendUrl,
                                )
                                checkResult = result
                                val checkedKey = when (llmProvider) {
                                    LlmProvider.GROQ -> groqInput.trim()
                                    LlmProvider.GEMINI -> geminiInput.trim()
                                }
                                checkSummary = when {
                                    checkedKey.isNotBlank() && result.llmOk == true ->
                                        result.llmMessage ?: context.getString(R.string.settings_groq_test_ok)
                                    checkedKey.isBlank() && result.backendOk ->
                                        context.getString(R.string.settings_groq_test_ok)
                                    checkedKey.isNotBlank() && result.llmOk == false ->
                                        result.llmMessage ?: context.getString(R.string.settings_groq_test_fail)
                                    result.backendOk ->
                                        result.backendMessage ?: context.getString(R.string.settings_groq_test_ok)
                                    else ->
                                        result.llmMessage ?: result.backendMessage
                                            ?: context.getString(R.string.settings_groq_test_fail)
                                }
                                isChecking = false
                            }
                        },
                    )
                    if (isChecking) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.height(20.dp),
                                color = GoldBright,
                                strokeWidth = 2.dp,
                            )
                            Text(
                                text = context.getString(R.string.settings_groq_checking),
                                modifier = Modifier.padding(start = 12.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MutedLavender,
                            )
                        }
                    }
                    checkSummary?.let { summary ->
                        Spacer(modifier = Modifier.height(8.dp))
                        val checkOk = checkResult?.llmOk == true ||
                            (activeApiInput.isBlank() && checkResult?.backendOk == true)
                        Text(
                            text = summary,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (checkOk) LiveGreen else ErrorCoral,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    SecondaryStoryButton(
                        text = when (llmProvider) {
                            LlmProvider.GROQ -> context.getString(R.string.settings_groq_get_key)
                            LlmProvider.GEMINI -> context.getString(R.string.settings_gemini_get_key)
                        },
                        onClick = {
                            val url = when (llmProvider) {
                                LlmProvider.GROQ -> "https://console.groq.com/keys"
                                LlmProvider.GEMINI -> "https://aistudio.google.com/apikey"
                            }
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        },
                    )
                }

                PrimaryStoryButton(
                    text = when {
                        isSaving -> context.getString(R.string.settings_saving)
                        saveFeedback != null -> saveFeedback!!
                        else -> context.getString(R.string.action_save)
                    },
                    enabled = hasPendingChanges && !isSaving,
                    onClick = {
                        scope.launch {
                            isSaving = true
                            saveFeedback = null
                            nInput.toIntOrNull()?.let { settings.setEveryNTracks(it) }
                            sameTrackInput.toIntOrNull()?.let { settings.setSameTrackStoryEveryN(it) }
                            settings.setGroqApiKey(groqInput)
                            settings.setGeminiApiKey(geminiInput)
                            app.backendAuthManager.invalidateToken()
                            app.apiClient.invalidateCache()
                            app.triggerEngine.resetCounter()
                            app.storyRepository.refreshQuota()
                            isSaving = false
                            saveFeedback = context.getString(R.string.settings_saved)
                            delay(2500)
                            if (saveFeedback == context.getString(R.string.settings_saved)) {
                                saveFeedback = null
                            }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun CollapsibleSettingsSection(
    title: String,
    summary: String,
    initiallyExpanded: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    var expanded by remember { mutableStateOf(initiallyExpanded) }

    GlassCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel(text = title)
                if (!expanded) {
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) {
                    LocalContext.current.getString(R.string.history_collapse)
                } else {
                    LocalContext.current.getString(R.string.history_expand)
                },
                tint = GoldBright,
            )
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            Column {
                Spacer(modifier = Modifier.height(8.dp))
                content()
            }
        }
    }
}

@Composable
private fun NarratorRadioRow(
    label: String,
    description: String,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(selectedColor = GoldBright),
        )
        Column(modifier = Modifier.padding(top = 12.dp, end = 8.dp)) {
            Text(text = label, style = MaterialTheme.typography.bodyMedium, color = CreamText)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun PreferenceRadioRow(
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(selectedColor = GoldBright),
        )
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = CreamText)
    }
}

@Composable
private fun SettingSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleMedium,
            color = CreamText,
        )
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

private fun buildTriggerSummary(
    context: android.content.Context,
    triggerMode: TriggerMode,
    specificArtists: Set<String>,
    specificGenres: Set<String>,
): String {
    val base = triggerModeLabel(context, triggerMode)
    return when (triggerMode) {
        TriggerMode.SPECIFIC_ARTISTS -> {
            if (specificArtists.isEmpty()) base
            else "$base · ${context.getString(R.string.settings_pick_selected_count, specificArtists.size)}"
        }
        TriggerMode.SPECIFIC_GENRES -> {
            if (specificGenres.isEmpty()) base
            else "$base · ${context.getString(R.string.settings_pick_selected_count, specificGenres.size)}"
        }
        else -> base
    }
}
