package com.musicstory.app.domain

enum class OfflinePackPhase(val id: String) {
    IDLE("idle"),
    COLLECTING("collecting"),
    GENERATING("generating"),
    READY("ready"),
    ;

    companion object {
        fun fromId(id: String?): OfflinePackPhase =
            entries.find { it.id == id } ?: IDLE
    }
}
