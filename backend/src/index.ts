import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import storyRouter from './routes/story.js';
import authRouter from './routes/auth.js';
import { isAppAuthEnabled } from './services/jwt.js';
import { AUDIO_DIR } from './services/yandex-tts.js';
import { hasGroqApiKey } from './services/groq.js';
import { hasYandexCredentials } from './services/yandex-tts.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requireSignedAudioAccess } from './middleware/audio-auth.js';
import { rateLimitHealth } from './middleware/rate-limit.js';
import { isProduction } from './config/security.js';
import { SECURITY } from './config/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(express.json({ limit: SECURITY.jsonBodyLimit }));

app.use('/audio', requireSignedAudioAccess, express.static(AUDIO_DIR, {
  dotfiles: 'deny',
  index: false,
  maxAge: 0,
}));

app.get('/health', rateLimitHealth, (_req, res) => {
  if (isProduction()) {
    res.json({ status: 'ok' });
    return;
  }
  res.json({
    status: 'ok',
    service: 'music-story-bff',
    groq: hasGroqApiKey(),
    yandexTts: hasYandexCredentials(),
    appAuthRequired: isAppAuthEnabled(),
  });
});

app.use('/v1/auth', authRouter);
app.use('/v1/story', storyRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Music Story BFF listening on http://0.0.0.0:${PORT}`);
  console.log(`  POST /v1/auth/token — app JWT`);
  console.log(`  POST /v1/story/full — story + optional Yandex TTS`);
  console.log(`  GET  /health — health check`);
  console.log(`  GET  /audio/* — signed audio only`);
});
