package com.musicstory.app.domain

/** Subscription tier gates for UI and orchestrator. */
object TierAccess {
    fun isPremiumLike(tier: String?): Boolean =
        tier?.lowercase() in setOf("premium", "trial", "unlimited")

    /** Квота из последнего story-запроса + кэш профиля / billing (trial до первой истории). */
    fun resolveEffectiveTier(
        dailyQuotaTier: String?,
        plan: String?,
        trialUntil: Long?,
        premiumUntil: Long?,
    ): String? {
        val now = System.currentTimeMillis()
        val normalizedPlan = plan?.trim()?.lowercase()
        if (normalizedPlan == "premium" && (premiumUntil ?: 0L) > now) return "premium"
        if (normalizedPlan == "trial" && (trialUntil ?: 0L) > now) return "trial"
        if (isPremiumLike(dailyQuotaTier)) return dailyQuotaTier
        return dailyQuotaTier ?: normalizedPlan
    }

    /** Manual «Рассказать историю» — свой API-ключ или платный тариф. */
    fun canShowManualStoryButton(hasPersonalApiKey: Boolean, tier: String?): Boolean =
        hasPersonalApiKey || isPremiumLike(tier)

    fun canUseManualMode(hasPersonalApiKey: Boolean, tier: String?): Boolean =
        hasPersonalApiKey || isPremiumLike(tier)

    /** Частота (N треков), жанры, артисты, always/never — только premium/trial. */
    fun canUseAdvancedTriggers(tier: String?): Boolean = isPremiumLike(tier)

    /** На free фиксированные «каждые N треков» без редактирования. */
    fun canCustomizeEveryNTracks(tier: String?): Boolean = isPremiumLike(tier)

    /** Плавное затемнение — всегда доступно; длительность настраивает premium. */
    fun canCustomizeMusicFadeSeconds(tier: String?): Boolean = isPremiumLike(tier)

    /** Бесплатный тариф без своего ключа — можно выбрать free-модель на сервере. */
    fun isFreeServerTier(tier: String?): Boolean =
        !isPremiumLike(tier)

    /** Продвинутые настройки AI (ключ, провайдер, модель) — всегда доступны в UI. */
    fun canUseAdvancedLlmSettings(): Boolean = true

    /** Свой порог «трек прослушан» (секунды) — premium. */
    fun canCustomizeListenThresholdSeconds(tier: String?): Boolean = isPremiumLike(tier)

    /** Сохранение озвучки на телефон и replay без интернета — расширенный тариф. */
    fun canUseOfflineAudioCache(tier: String?): Boolean = isPremiumLike(tier)
}
