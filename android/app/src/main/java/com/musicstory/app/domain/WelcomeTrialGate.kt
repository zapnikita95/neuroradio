package com.musicstory.app.domain

import com.musicstory.app.MusicStoryApp
import com.musicstory.app.data.local.CachedAccountProfile
import com.musicstory.app.util.DeviceFingerprint
import kotlinx.coroutines.flow.first

object WelcomeTrialGate {
    suspend fun completeAfterSkip(app: MusicStoryApp) {
        val trialActive = claimWelcomeTrialOnServer(app)
        app.settingsDataStore.setAccountLoginGateCompleted(true)
        if (trialActive) {
            applyWelcomeTrialTtsDefaults(app)
        }
    }

    suspend fun completeAfterLogin(app: MusicStoryApp) {
        app.settingsDataStore.setAccountLoginGateCompleted(true)
        val profile = app.settingsDataStore.readCachedAccountProfile()
        if (isTrialActive(profile)) {
            applyWelcomeTrialTtsDefaults(app)
        }
    }

    suspend fun applyWelcomeTrialTtsDefaults(app: MusicStoryApp) {
        val lang = resolveAppLanguage(app.settingsDataStore.appLanguage.first())
        app.settingsDataStore.setUserTtsBilling(UserTtsBilling.SERVER)
        when (lang) {
            ResolvedAppLanguage.RU -> app.settingsDataStore.setServerTtsProvider(ServerTtsProvider.YANDEX)
            ResolvedAppLanguage.EN -> app.settingsDataStore.setServerTtsProvider(ServerTtsProvider.EDGE)
        }
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
}
