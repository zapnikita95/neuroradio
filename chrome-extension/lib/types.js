/** Shared settings shape for extension (subset of Android/desktop). */
export const ExtensionSettingsShape = {
  backendUrl: '',
  installId: '',
  desktopAuthSecret: '',
  accessToken: '',
  tokenExpiresAt: 0,
  manualMode: false,
  autoIntercept: true,
  triggerMode: 'EVERY_N_TRACKS',
  everyNTracks: 10,
  sameTrackStoryEveryN: 3,
  storyLength: '60s',
  email: '',
  accountLinked: false,
};
