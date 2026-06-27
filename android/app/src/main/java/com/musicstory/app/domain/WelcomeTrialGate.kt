package com.musicstory.app.domain

import com.musicstory.app.MusicStoryApp
import com.musicstory.app.data.local.CachedAccountProfile
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object WelcomeTrialGate {
    private val _trialStartedEvents = MutableSharedFlow<Long>(extraBufferCapacity = 1)
    val trialStartedEvents: SharedFlow<Long> = _trialStartedEvents.asSharedFlow()

    suspend fun completeAfterSkip(app: MusicStoryApp) {
        app.settingsDataStore.setAccountLoginGateCompleted(true)
        app.storyOrchestrator.notifyTierMayHaveChanged()
    }

    suspend fun completeAfterLogin(app: MusicStoryApp) {
        app.settingsDataStore.setAccountLoginGateCompleted(true)
        val profile = app.settingsDataStore.readCachedAccountProfile()
        if (isTrialActive(profile) || isPremiumActive(profile)) {
            applyWelcomeTrialDefaults(app)
        }
        app.storyOrchestrator.notifyTierMayHaveChanged()
    }

    /** Вызывается после первой успешно озвученной истории о треке. */
    suspend fun handleWelcomeTrialGranted(app: MusicStoryApp, trialUntil: Long?) {
        val until = trialUntil ?: return
        if (until <= System.currentTimeMillis()) return

        val cached = app.settingsDataStore.readCachedAccountProfile()
        app.settingsDataStore.saveAccountProfile(
            CachedAccountProfile(
                accountId = cached?.accountId,
                email = cached?.email,
                telegramId = cached?.telegramId,
                telegramUsername = cached?.telegramUsername,
                plan = "trial",
                trialUntil = until,
                premiumUntil = cached?.premiumUntil,
            ),
        )
        applyPremiumExperienceDefaults(app)
        app.storyOrchestrator.notifyTierMayHaveChanged()
        _trialStartedEvents.emit(until)
        StoryLog.i("Welcome trial started after first narrated story until=$until")
    }

    /** До записи триала в профиль — первая история уже на SpeechKit (preview tier на сервере). */
    suspend fun preparePremiumExperienceForFirstStory(app: MusicStoryApp) {
        applyPremiumExperienceDefaults(app)
    }

    suspend fun applyWelcomeTrialDefaults(app: MusicStoryApp) {
        applyWelcomeTrialTtsDefaults(app)
        val autoOn = app.settingsDataStore.autoIntercept.first()
        if (autoOn) {
            applyPremiumPlaybackDefaults(app)
        }
    }

    suspend fun applyWelcomeTrialTtsDefaults(app: MusicStoryApp) {
        val lang = resolveAppLanguage(app.settingsDataStore.appLanguage.first())
        app.settingsDataStore.setUserTtsBilling(UserTtsBilling.SERVER)
        when (lang) {
            ResolvedAppLanguage.RU -> {
                app.settingsDataStore.setServerTtsProvider(ServerTtsProvider.YANDEX)
                app.settingsDataStore.setTtsVoice(TtsVoice.ZAHAR)
            }
            ResolvedAppLanguage.EN -> {
                app.settingsDataStore.setServerTtsProvider(ServerTtsProvider.ELEVENLABS)
            }
        }
    }

    /** Premium-настройки при первой истории (SpeechKit + голоса Yandex). */
    suspend fun applyPremiumExperienceDefaults(app: MusicStoryApp) {
        applyWelcomeTrialTtsDefaults(app)
        val autoOn = app.settingsDataStore.autoIntercept.first()
        if (autoOn) {
            applyPremiumPlaybackDefaults(app)
        }
    }

    /** Авто-режим: история каждые 3 трека (дефолт trial/premium). */
    suspend fun applyPremiumPlaybackDefaults(app: MusicStoryApp) {
        app.settingsDataStore.setAutoPlaybackMode(true)
        app.settingsDataStore.setEveryNTracks(SettingsDataStore.DEFAULT_EVERY_N_TRACKS)
        app.settingsDataStore.setTriggerMode(TriggerMode.EVERY_N_TRACKS)
    }

    suspend fun enableRadioStationMode(app: MusicStoryApp) {
        applyPremiumPlaybackDefaults(app)
    }

    suspend fun enableScrobbleOnlyMode(app: MusicStoryApp) {
        app.settingsDataStore.setManualMode(true)
        app.settingsDataStore.setAutoIntercept(false)
    }

    fun notifyTrialStartedFromPlayback(app: MusicStoryApp, trialUntil: Long) {
        app.appScope.launch {
            runCatching { _trialStartedEvents.emit(trialUntil) }
        }
    }

    private fun isTrialActive(profile: CachedAccountProfile?): Boolean {
        if (profile == null) return false
        return profile.plan == "trial" &&
            (profile.trialUntil ?: 0L) > System.currentTimeMillis()
    }

    private fun isPremiumActive(profile: CachedAccountProfile?): Boolean {
        if (profile == null) return false
        return profile.plan == "premium" &&
            (profile.premiumUntil ?: 0L) > System.currentTimeMillis()
    }
}
