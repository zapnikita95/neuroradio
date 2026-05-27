import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import storyRouter from './routes/story.js';
import authRouter from './routes/auth.js';
import syncRouter from './routes/sync.js';
import { isAppAuthEnabled } from './services/jwt.js';
import { AUDIO_DIR } from './services/yandex-tts.js';
import { hasGroqApiKey } from './services/groq.js';
import { hasOpenRouterApiKey } from './services/openrouter.js';
import { hasGeminiApiKey } from './services/gemini.js';
import { resolveLlmProvider } from './services/llm-provider.js';
import { hasYandexCredentials } from './services/yandex-tts.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requireSignedAudioAccess } from './middleware/audio-auth.js';
import { requestLogger } from './middleware/request-logger.js';
import { SECURITY } from './config/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const BUILD_ID =
  process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.SOURCE_VERSION?.slice(0, 7) ||
  'local';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(requestLogger);
app.use(express.json({ limit: SECURITY.jsonBodyLimit }));

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
});

app.use('/audio', requireSignedAudioAccess, express.static(AUDIO_DIR, {
  dotfiles: 'deny',
  index: false,
  maxAge: 0,
}));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'music-story-bff',
    build: BUILD_ID,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    llmProvider: resolveLlmProvider(),
    groq: hasGroqApiKey(),
    openrouter: hasOpenRouterApiKey(),
    gemini: hasGeminiApiKey(),
    yandexTts: hasYandexCredentials(),
    appAuthRequired: isAppAuthEnabled(),
  });
});

app.use('/v1/auth', authRouter);
app.use('/v1/sync', syncRouter);
app.use('/v1/story', storyRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Music Story BFF listening on http://0.0.0.0:${PORT}`);
  console.log(
    `[boot] build=${BUILD_ID} llm=${resolveLlmProvider()} openrouter=${hasOpenRouterApiKey()} groq=${hasGroqApiKey()} gemini=${hasGeminiApiKey()} yandexTts=${hasYandexCredentials()} auth=${isAppAuthEnabled()}`,
  );
  console.log(`  POST /v1/auth/token — app JWT`);
  console.log(`  GET  /v1/sync/* — linked account settings & history`);
  console.log(`  POST /v1/story/full — story + optional Yandex TTS`);
  console.log(`  GET  /health — health check`);
  console.log(`  GET  /audio/* — signed audio only`);
});

function shutdown(signal: string): void {
  console.log(`[shutdown] ${signal} — closing HTTP server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
