package com.musicstory.app.domain

import com.musicstory.app.MusicStoryApp
import com.musicstory.app.data.local.CachedAccountProfile
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.util.DeviceFingerprint
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object WelcomeTrialGate {
    suspend fun completeAfterSkip(app: MusicStoryApp) {
        app.settingsDataStore.setAccountLoginGateCompleted(true)
        app.storyOrchestrator.notifyTierMayHaveChanged()
        app.appScope.launch {
            runCatching {
                val trialActive = claimWelcomeTrialOnServer(app)
                if (trialActive) {
                    applyWelcomeTrialDefaults(app)
                    app.storyOrchestrator.notifyTierMayHaveChanged()
                }
            }.onFailure { err ->
                StoryLog.e("Welcome trial claim failed after skip", err)
            }
        }
    }

    suspend fun completeAfterLogin(app: MusicStoryApp) {
        app.settingsDataStore.setAccountLoginGateCompleted(true)
        val profile = app.settingsDataStore.readCachedAccountProfile()
        if (isTrialActive(profile) || isPremiumActive(profile)) {
            applyWelcomeTrialDefaults(app)
        }
        app.storyOrchestrator.notifyTierMayHaveChanged()
    }

    suspend fun applyWelcomeTrialDefaults(app: MusicStoryApp) {
        applyWelcomeTrialTtsDefaults(app)
        applyPremiumPlaybackDefaults(app)
    }

    suspend fun applyWelcomeTrialTtsDefaults(app: MusicStoryApp) {
        val lang = resolveAppLanguage(app.settingsDataStore.appLanguage.first())
        app.settingsDataStore.setUserTtsBilling(UserTtsBilling.SERVER)
        when (lang) {
            ResolvedAppLanguage.RU -> app.settingsDataStore.setServerTtsProvider(ServerTtsProvider.YANDEX)
            ResolvedAppLanguage.EN -> app.settingsDataStore.setServerTtsProvider(ServerTtsProvider.EDGE)
        }
    }

    /** Авто-режим: история каждые 3 трека (дефолт trial/premium). */
    suspend fun applyPremiumPlaybackDefaults(app: MusicStoryApp) {
        app.settingsDataStore.setAutoPlaybackMode(true)
        app.settingsDataStore.setEveryNTracks(SettingsDataStore.DEFAULT_EVERY_N_TRACKS)
        app.settingsDataStore.setTriggerMode(TriggerMode.EVERY_N_TRACKS)
    }

    private suspend fun claimWelcomeTrialOnServer(app: MusicStoryApp): Boolean {
        val url = app.settingsDataStore.backendUrl.first()
        if (url.isBlank()) return false
        val fp = DeviceFingerprint.get(app)
        val result = app.accountAuthManager.claimDeviceWelcomeTrial(url, fp) ?: return false
        result.entitlement?.let { ent ->
            val cached = app.settingsDataStore.readCachedAccountProfile()
            app.settingsDataStore.saveAccountProfile(
                CachedAccountProfile(
                    accountId = cached?.accountId,
                    email = cached?.email,
                    telegramId = cached?.telegramId,
                    telegramUsername = cached?.telegramUsername,
                    plan = ent.plan,
                    trialUntil = ent.trialUntil,
                    premiumUntil = ent.premiumUntil,
                ),
            )
        }
        return result.trialActive
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
