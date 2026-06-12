import { yandexAudioExtension } from './yandex-tts.js';

export type MobileClientPlatform = 'ios' | 'android';

export function normalizeClientPlatform(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function isMobileClientPlatform(platform: string): platform is MobileClientPlatform {
  return platform === 'ios' || platform === 'android';
}

/** Mobile apps (ios/android) must receive WAV — OGG breaks AVPlayer and Huawei ExoPlayer offline. */
export function storyAudioExtensionForClient(body: { client_platform?: unknown }): 'ogg' | 'wav' {
  const platform = normalizeClientPlatform(body.client_platform);
  if (isMobileClientPlatform(platform)) return 'wav';
  return yandexAudioExtension();
}

export function requiresMobileWavPlayback(body: { client_platform?: unknown }): boolean {
  return storyAudioExtensionForClient(body) === 'wav';
}

export function assertMobileWavFileName(fileName: string, context: string): void {
  if (!fileName.toLowerCase().endsWith('.wav')) {
    throw new Error(`${context}: mobile client requires .wav file, got ${fileName}`);
  }
}
