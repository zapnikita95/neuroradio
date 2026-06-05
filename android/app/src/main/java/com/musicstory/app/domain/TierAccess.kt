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

    /** Жанры, артисты, повтор того же трека — только premium/trial. */
    fun canUseAdvancedTriggers(tier: String?): Boolean = isPremiumLike(tier)

    /** Плавное затемнение музыки — платная настройка. */
    fun canUseMusicFade(tier: String?): Boolean = isPremiumLike(tier)
}
