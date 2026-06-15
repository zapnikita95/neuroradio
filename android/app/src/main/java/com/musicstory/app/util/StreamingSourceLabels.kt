package com.musicstory.app.util

import android.content.Context
import com.musicstory.app.R

fun Context.streamingSourceLabel(packageName: String?): String? {
    if (packageName.isNullOrBlank()) return null
    return when {
        packageName.contains("spotify", ignoreCase = true) -> getString(R.string.source_spotify)
        packageName.contains("yandex", ignoreCase = true) -> getString(R.string.source_yandex_music)
        packageName.contains("newpipe", ignoreCase = true) -> "NewPipe"
        else -> packageName.substringAfterLast('.').takeIf { it.isNotBlank() }
    }
}
