package com.musicstory.app.data.local

import com.musicstory.app.data.remote.AccountAuthManager

data class CachedAccountProfile(
    val accountId: String? = null,
    val email: String? = null,
    val telegramId: Long? = null,
    val telegramUsername: String? = null,
    val plan: String? = null,
    val trialUntil: Long? = null,
    val premiumUntil: Long? = null,
) {
    val isLoggedIn: Boolean get() = !email.isNullOrBlank() || telegramId != null
}

fun AccountAuthManager.AccountProfile.toCached(): CachedAccountProfile =
    CachedAccountProfile(
        accountId = accountId,
        email = email,
        telegramId = telegramId,
        telegramUsername = telegramUsername,
        plan = plan,
        trialUntil = trialUntil,
        premiumUntil = premiumUntil,
    )

fun CachedAccountProfile.toProfile(): AccountAuthManager.AccountProfile =
    AccountAuthManager.AccountProfile(
        accountId = accountId,
        email = email,
        telegramId = telegramId,
        telegramUsername = telegramUsername,
        plan = plan,
        trialUntil = trialUntil,
        premiumUntil = premiumUntil,
    )
