package com.musicstory.app.domain

enum class MusicInterruptionMode(
    val id: String,
    val labelRu: String,
) {
    @Deprecated("Always use fade — kept for migration from old prefs")
    PAUSE("pause", "Пауза"),
    FADE("fade", "Затемнение"),
    ;

    companion object {
        fun fromId(id: String?): MusicInterruptionMode =
            entries.firstOrNull { it.id == id?.trim()?.lowercase() } ?: FADE
    }
}
