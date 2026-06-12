/**
 * Assert ios/android always route to WAV on the server (no OGG leak to mobile).
 * Run: npm run build && node scripts/test-mobile-wav-routing.mjs
 */
import {
  isMobileClientPlatform,
  requiresMobileWavPlayback,
  storyAudioExtensionForClient,
} from '../dist/services/client-audio-format.js';

const cases = [
  { platform: 'android', ext: 'wav', mobile: true },
  { platform: 'ios', ext: 'wav', mobile: true },
  { platform: 'Android', ext: 'wav', mobile: true },
  { platform: 'IOS', ext: 'wav', mobile: true },
  { platform: 'web', ext: 'ogg', mobile: false },
  { platform: '', ext: 'ogg', mobile: false },
  { platform: undefined, ext: 'ogg', mobile: false },
];

let failed = 0;
for (const c of cases) {
  const body = { client_platform: c.platform };
  const ext = storyAudioExtensionForClient(body);
  const mobile = requiresMobileWavPlayback(body);
  const norm = typeof c.platform === 'string' ? c.platform.trim().toLowerCase() : '';
  const isMobile = isMobileClientPlatform(norm);
  if (ext !== c.ext || mobile !== c.mobile) {
    console.error('FAIL', c, { ext, mobile, isMobile });
    failed++;
  } else {
    console.log('OK', c.platform ?? '(none)', '->', ext);
  }
}

if (failed > 0) {
  console.error(`\n${failed} routing checks failed`);
  process.exit(1);
}

console.log('\nAll mobile WAV routing checks passed');
