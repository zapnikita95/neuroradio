package com.musicstory.app.util

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

object DeviceFingerprint {
    @SuppressLint("HardwareIds")
    fun get(context: Context): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        ).orEmpty().trim()
        val raw = "$androidId|${context.packageName}"
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(raw.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
