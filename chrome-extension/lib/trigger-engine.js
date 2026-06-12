/** Same trigger rules as desktop/Android TriggerEngine. */
export class TriggerEngine {
  tracksSinceLastStory = 0;
  /** @type {Map<string, number>} */
  sameTrackPlayCounts = new Map();

  resetCounter() {
    this.tracksSinceLastStory = 0;
    this.sameTrackPlayCounts.clear();
  }

  /**
   * @param {{ mode: string; autoIntercept: boolean; everyNTracks: number; sameTrackStoryEveryN: number; specificArtists: string[]; specificGenres: string[] }} settings
   */
  onTrackPlayed(settings, trackKey, trackArtist, trackGenre) {
    this.registerSameTrackPlay(trackKey);

    if (!settings.autoIntercept || settings.mode === 'NEVER') {
      return false;
    }

    let globalOk = false;
    switch (settings.mode) {
      case 'ALWAYS':
        globalOk = true;
        break;
      case 'EVERY_N_TRACKS':
        this.tracksSinceLastStory += 1;
        if (this.tracksSinceLastStory >= settings.everyNTracks) {
          this.tracksSinceLastStory = 0;
          globalOk = true;
        }
        break;
      case 'SPECIFIC_ARTISTS':
        globalOk = settings.specificArtists?.some((a) =>
          trackArtist.toLowerCase().includes(a.toLowerCase()),
        );
        break;
      case 'SPECIFIC_GENRES':
        if (!trackGenre) return false;
        globalOk = settings.specificGenres?.some((g) =>
          trackGenre.toLowerCase().includes(g.toLowerCase()),
        );
        break;
      default:
        break;
    }

    if (!globalOk) return false;
    return this.sameTrackStoryAllowed(trackKey, settings.sameTrackStoryEveryN);
  }

  sameTrackStoryAllowed(trackKey, interval) {
    const count = this.sameTrackPlayCounts.get(trackKey) ?? 1;
    if (interval <= 1) return true;
    return count === 1 || count % interval === 0;
  }

  tracksUntilNext(settings) {
    if (settings.mode !== 'EVERY_N_TRACKS') return null;
    return Math.max(0, settings.everyNTracks - this.tracksSinceLastStory);
  }

  registerSameTrackPlay(trackKey) {
    this.sameTrackPlayCounts.set(trackKey, (this.sameTrackPlayCounts.get(trackKey) ?? 0) + 1);
  }
}
