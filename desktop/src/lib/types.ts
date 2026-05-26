export type TriggerMode =
  | "EVERY_N_TRACKS"
  | "SPECIFIC_ARTISTS"
  | "SPECIFIC_GENRES"
  | "ALWAYS"
  | "NEVER";

export interface TriggerSettings {
  mode: TriggerMode;
  everyNTracks: number;
  sameTrackStoryEveryN: number;
  specificArtists: string[];
  specificGenres: string[];
  autoIntercept: boolean;
}

export interface TrackInfo {
  artist: string;
  title: string;
  album?: string;
  appId?: string;
  thumbnail?: string;
  displayKey: string;
  isPlaying: boolean;
}

export interface StoryResponse {
  artist: string;
  title: string;
  year?: number | null;
  genre?: string | null;
  script: string;
  demo?: boolean;
  audioUrl?: string | null;
  voiceId?: string;
  quota?: {
    used: number;
    limit: number;
    remaining: number;
    resetsAt?: string;
  };
}

export interface StoryHistoryEntry {
  id: string;
  trackKey: string;
  artist: string;
  title: string;
  script: string;
  angle?: string;
  playedAt: number;
}

export type OrchestratorState =
  | "IDLE"
  | "LISTENING"
  | "FETCHING_STORY"
  | "PREPARING_PLAYBACK"
  | "PLAYING_STORY"
  | "ERROR";

export interface OrchestratorUiState {
  state: OrchestratorState;
  currentTrack: TrackInfo | null;
  lastStory: StoryResponse | null;
  errorMessage: string | null;
  tracksUntilNext: number | null;
  expanded: boolean;
}

export interface AppSettings {
  manualMode: boolean;
  autoIntercept: boolean;
  triggerMode: TriggerMode;
  everyNTracks: number;
  sameTrackStoryEveryN: number;
  specificArtists: string[];
  specificGenres: string[];
  storyLength: string;
  backendUrl: string;
  desktopAuthSecret: string;
  installId: string;
  accessToken: string;
  tokenExpiresAt: number;
  widgetX: number | null;
  widgetY: number | null;
  onboardingDone: boolean;
  autostart: boolean;
  accountLinked: boolean;
  accountId: string;
  syncCode: string;
  settingsSyncedAt: number;
  lastHistorySyncAt: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  manualMode: false,
  autoIntercept: true,
  triggerMode: "EVERY_N_TRACKS",
  everyNTracks: 10,
  sameTrackStoryEveryN: 3,
  specificArtists: [],
  specificGenres: [],
  storyLength: "60s",
  backendUrl: "https://music-story-production.up.railway.app",
  desktopAuthSecret: "",
  installId: "",
  accessToken: "",
  tokenExpiresAt: 0,
  widgetX: null,
  widgetY: null,
  onboardingDone: false,
  autostart: false,
  accountLinked: false,
  accountId: "",
  syncCode: "",
  settingsSyncedAt: 0,
  lastHistorySyncAt: 0,
};

export function trackFromSnapshot(snapshot: {
  artist: string;
  title: string;
  album: string;
  appId: string;
  displayKey: string;
  isPlaying: boolean;
  thumbnailBase64?: string | null;
}): TrackInfo {
  return {
    artist: snapshot.artist,
    title: snapshot.title,
    album: snapshot.album,
    appId: snapshot.appId,
    displayKey: snapshot.displayKey,
    isPlaying: snapshot.isPlaying,
    thumbnail: snapshot.thumbnailBase64
      ? `data:image/jpeg;base64,${snapshot.thumbnailBase64}`
      : undefined,
  };
}
