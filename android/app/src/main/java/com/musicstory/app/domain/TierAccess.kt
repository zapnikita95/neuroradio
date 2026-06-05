package com.musicstory.app.domain

/** Subscription tier gates for UI and orchestrator. */
object TierAccess {
    fun isPremiumLike(tier: String?): Boolean =
        tier?.lowercase() in setOf("premium", "trial", "unlimited")

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

    /** Свой API-ключ — полный выбор провайдера и моделей. */
    fun canUseAdvancedLlmSettings(hasPersonalApiKey: Boolean): Boolean = hasPersonalApiKey

    /** Свой порог «трек прослушан» (секунды) — premium. */
    fun canCustomizeListenThresholdSeconds(tier: String?): Boolean = isPremiumLike(tier)
}
