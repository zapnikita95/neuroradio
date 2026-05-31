package com.musicstory.app.domain

enum class AppPowerMode(val id: String) {
    /** Парсим музыку и автоматически рассказываем истории. */
    ON("on"),

    /** Парсим треки, но авто-истории не включаются (ручная кнопка работает). */
    PARSE_ONLY("parse_only"),

    /** Полностью выключено: не парсим, служба не работает. */
    OFF("off"),
    ;

    fun next(): AppPowerMode = when (this) {
        ON -> PARSE_ONLY
        PARSE_ONLY -> OFF
        OFF -> ON
    }

    companion object {
        fun fromId(id: String?): AppPowerMode = entries.find { it.id == id } ?: ON
    }
}
