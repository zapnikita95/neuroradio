import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import storyRouter from './routes/story.js';
import groqProxyRouter from './routes/groq-proxy.js';
import { AUDIO_DIR } from './services/yandex-tts.js';
import { hasGroqApiKey } from './services/groq.js';
import { hasYandexCredentials } from './services/yandex-tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = express();

app.use(cors());
app.use(express.json());

app.use('/audio', express.static(AUDIO_DIR));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'music-story-bff',
    timestamp: new Date().toISOString(),
    groq: hasGroqApiKey(),
    yandexTts: hasYandexCredentials(),
    proxySecretRequired: Boolean(process.env.PROXY_SECRET?.trim()),
  });
});

app.use('/v1/story', storyRouter);
app.use('/v1/groq', groqProxyRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Music Story BFF listening on http://0.0.0.0:${PORT}`);
  console.log(`  POST /v1/story/full — story + optional Yandex TTS`);
  console.log(`  POST /v1/groq/chat/completions — Groq proxy (Railway)`);
  console.log(`  GET  /health — health check`);
  console.log(`  GET  /audio/* — static audio files (${AUDIO_DIR})`);
});
