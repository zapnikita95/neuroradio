package com.musicstory.app.domain

enum class TriggerMode {
    EVERY_N_TRACKS,
    SPECIFIC_ARTISTS,
    SPECIFIC_GENRES,
    ALWAYS,
    NEVER,
    ;

    companion object {
        fun fromName(name: String): TriggerMode {
            return entries.find { it.name.equals(name, ignoreCase = true) } ?: EVERY_N_TRACKS
        }
    }
}

data class TriggerSettings(
    val mode: TriggerMode = TriggerMode.EVERY_N_TRACKS,
    val everyNTracks: Int = SettingsDefaults.EVERY_N_TRACKS,
    val sameTrackStoryEveryN: Int = SettingsDefaults.SAME_TRACK_STORY_EVERY_N,
    val specificArtists: Set<String> = emptySet(),
    val specificGenres: Set<String> = emptySet(),
    val autoIntercept: Boolean = true,
)

object SettingsDefaults {
    const val EVERY_N_TRACKS = 10
    const val SAME_TRACK_STORY_EVERY_N = 3
}

class TriggerEngine {

    private var tracksSinceLastStory = 0
    private val sameTrackPlayCounts = mutableMapOf<String, Int>()

    fun resetCounter() {
        tracksSinceLastStory = 0
        sameTrackPlayCounts.clear()
    }

    /**
     * @return true if auto story should fire (global trigger AND same-track interval)
     */
    fun onTrackPlayed(
        settings: TriggerSettings,
        trackKey: String,
        trackArtist: String,
        trackGenre: String?,
    ): Boolean {
        registerSameTrackPlay(trackKey)

        if (!settings.autoIntercept || settings.mode == TriggerMode.NEVER) {
            return false
        }

        val globalOk = when (settings.mode) {
            TriggerMode.ALWAYS -> true
            TriggerMode.NEVER -> false
            TriggerMode.EVERY_N_TRACKS -> {
                tracksSinceLastStory++
                if (tracksSinceLastStory >= settings.everyNTracks) {
                    tracksSinceLastStory = 0
                    true
                } else {
                    false
                }
            }
            TriggerMode.SPECIFIC_ARTISTS ->
                settings.specificArtists.any { trackArtist.contains(it, ignoreCase = true) }
            TriggerMode.SPECIFIC_GENRES -> {
                val genre = trackGenre ?: return false
                settings.specificGenres.any { genre.contains(it, ignoreCase = true) }
            }
        }

        if (!globalOk) return false
        return sameTrackStoryAllowed(trackKey, settings.sameTrackStoryEveryN)
    }

    fun sameTrackStoryAllowed(trackKey: String, interval: Int): Boolean {
        val count = sameTrackPlayCounts[trackKey] ?: 1
        if (interval <= 1) return true
        return count == 1 || count % interval == 0
    }

    fun playsUntilSameTrackStory(trackKey: String, interval: Int): Int? {
        if (interval <= 1) return null
        val count = sameTrackPlayCounts[trackKey] ?: 0
        if (count == 0) return interval
        val remainder = count % interval
        return if (remainder == 0) 0 else interval - remainder
    }

    fun tracksUntilNext(settings: TriggerSettings): Int? {
        if (settings.mode != TriggerMode.EVERY_N_TRACKS) return null
        return (settings.everyNTracks - tracksSinceLastStory).coerceAtLeast(0)
    }

    private fun registerSameTrackPlay(trackKey: String) {
        sameTrackPlayCounts[trackKey] = (sameTrackPlayCounts[trackKey] ?: 0) + 1
    }
}
