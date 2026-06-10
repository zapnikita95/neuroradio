import './bootstrap-logs.js';
import './load-env.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import storyRouter from './routes/story.js';
import factsHintRouter from './routes/facts-hint.js';
import llmProbeRouter from './routes/llm-probe.js';
import authRouter from './routes/auth.js';
import syncRouter from './routes/sync.js';
import billingRouter from './routes/billing.js';
import accountAuthRouter from './routes/account-auth.js';
import { isAppAuthEnabled } from './services/jwt.js';
import { AUDIO_DIR } from './services/yandex-tts.js';
import { hasGroqApiKey } from './services/groq.js';
import { hasOpenRouterApiKey } from './services/openrouter.js';
import { hasGeminiApiKey } from './services/gemini.js';
import {
  checkOllamaHealth,
  hasLocalOllamaConfigured,
  resolveLocalOllamaBaseUrl,
  resolveLocalOllamaModel,
  testOllamaChat,
} from './services/local-ollama.js';
import { resolveLlmProvider } from './services/llm-provider.js';
import { hasYandexCredentials } from './services/yandex-tts.js';
import { canUseSileroTts } from './services/silero-tts.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requireSignedAudioAccess } from './middleware/audio-auth.js';
import { requestLogger } from './middleware/request-logger.js';
import { SECURITY } from './config/security.js';
import { mergeSeedBankOnBoot, purgeInvalidBankFacts } from './services/fact-bank.js';
import { ingestCuratedFactsOnBoot } from './services/curated-facts.js';
import { initPostgres, hasPostgres, closePostgres } from './services/db.js';
import { hydrateAccountStoreFromPostgres, migrateAccountStoryDataToPostgres } from './services/account-store.js';
import { hydrateDevTierStoreFromPostgres } from './services/dev-tier-store.js';
import { buildTelegramWidgetPageHtml, telegramBotUsername } from './routes/telegram-widget-page.js';
import { resolveTelegramWidgetBaseUrl, isTelegramConfigured } from './services/auth-config.js';
import { resolveWebsiteDir, serveWebsite } from './serve-website.js';
import publicRouter from './routes/public.js';
import { startSubscriptionRenewalScheduler } from './services/subscription-renewal.js';

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

app.use('/audio', requireSignedAudioAccess, (req, res, next) => {
  if (req.path.endsWith('.wav')) res.type('audio/wav');
  else if (req.path.endsWith('.ogg')) res.type('audio/ogg');
  next();
}, express.static(AUDIO_DIR, {
  dotfiles: 'deny',
  index: false,
  maxAge: 0,
}));

/** Probe Ollama from BFF host (phone cannot reach LAN Ollama directly). */
app.get('/health/ollama', async (req, res) => {
  const urlParam = typeof req.query.url === 'string' ? req.query.url : undefined;
  const modelParam = typeof req.query.model === 'string' ? req.query.model : undefined;
  const baseUrl = resolveLocalOllamaBaseUrl(urlParam);
  const model = resolveLocalOllamaModel(modelParam);
  const tags = await checkOllamaHealth(baseUrl);
  if (!tags.ok) {
    res.status(503).json({
      ok: false,
      baseUrl,
      model,
      models: tags.models,
      message: tags.message,
    });
    return;
  }
  const modelFound =
    tags.models.includes(model) ||
    tags.models.some((m) => m.startsWith(`${model}:`) || m === model);
  if (!modelFound) {
    res.status(503).json({
      ok: false,
      baseUrl,
      model,
      models: tags.models,
      message: `Model not found: ${model}`,
    });
    return;
  }
  try {
    const sample = await testOllamaChat(baseUrl, model);
    res.json({
      ok: true,
      baseUrl,
      model,
      models: tags.models,
      message: `Ollama OK — ${model}`,
      sample: sample.slice(0, 40),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      ok: false,
      baseUrl,
      model,
      models: tags.models,
      message,
    });
  }
});

app.get('/health', (_req, res) => {
  const llm = resolveLlmProvider();
  const openrouter = hasOpenRouterApiKey();
  const groq = hasGroqApiKey();
  const gemini = hasGeminiApiKey();
  const localOllama = hasLocalOllamaConfigured();
  const yandexTts = hasYandexCredentials();
  const sileroTts = canUseSileroTts();
  console.log(
    `[health] llm=${llm} openrouter=${openrouter} groq=${groq} gemini=${gemini} localOllama=${localOllama} yandexTts=${yandexTts} sileroTts=${sileroTts}`,
  );
  res.json({
    status: 'ok',
    service: 'music-story-bff',
    build: BUILD_ID,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    llmProvider: llm,
    groq,
    openrouter,
    gemini,
    localOllama,
    yandexTts,
    sileroTts,
    appAuthRequired: isAppAuthEnabled(),
    postgres: hasPostgres(),
  });
});

app.use('/v1/auth', authRouter);
app.use('/v1/sync', syncRouter);
app.use('/v1/billing', billingRouter);
app.use('/v1/account', accountAuthRouter);
app.use('/v1/llm', llmProbeRouter);
app.use('/v1/story', storyRouter);
app.use('/v1/facts', factsHintRouter);
app.use('/v1/public', publicRouter);

/** Telegram Login Widget — before static site so /telegram-login is never swallowed. */
function sendTelegramWidgetPage(req: express.Request, res: express.Response): void {
  const bot = telegramBotUsername();
  if (!bot) {
    res.status(503).type('text/plain').send('TELEGRAM_BOT_USERNAME not configured');
    return;
  }
  const appEmbed = req.query.app === '1' || req.query.embed === 'android';
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(buildTelegramWidgetPageHtml(bot, appEmbed));
}
app.get('/telegram-login', (req, res) => sendTelegramWidgetPage(req, res));

const websiteDir = resolveWebsiteDir(__dirname);
if (websiteDir) {
  console.log(`[boot] serving website from ${websiteDir}`);
  app.use(serveWebsite(websiteDir));
} else {
  console.warn('[boot] website/ not found — static site disabled');
  app.get('/', (_req, res) => sendTelegramWidgetPage(_req, res));
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

async function boot(): Promise<void> {
  await initPostgres();
  if (hasPostgres()) {
    await hydrateAccountStoreFromPostgres();
    await hydrateDevTierStoreFromPostgres();
    await migrateAccountStoryDataToPostgres();
    console.log('[boot] postgres stores hydrated');
  }

  try {
    const purged = purgeInvalidBankFacts();
    if (purged > 0) console.log(`[boot] fact-bank cleanup removed ${purged} invalid entries`);
    ingestCuratedFactsOnBoot();
    mergeSeedBankOnBoot();
  } catch (err) {
    console.warn('[boot] fact-bank purge failed:', err instanceof Error ? err.message : err);
  }

  startSubscriptionRenewalScheduler();

  const tgWidget = resolveTelegramWidgetBaseUrl();
  if (isTelegramConfigured() && tgWidget) {
    console.log(`[boot] telegram widget origin=${tgWidget} (@BotFather /setdomain must match hostname)`);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Music Story BFF listening on http://0.0.0.0:${PORT}`);
    console.log(`[boot] log file: ${process.env.LOCAL_LOG_FILE ?? '(console only)'}`);
    console.log(`[boot] build=${BUILD_ID} llm=${resolveLlmProvider()} openrouter=${hasOpenRouterApiKey()} groq=${hasGroqApiKey()} gemini=${hasGeminiApiKey()} yandexTts=${hasYandexCredentials()} auth=${isAppAuthEnabled()} postgres=${hasPostgres()}`);
    console.log(`  POST /v1/auth/token — app JWT`);
    console.log(`  GET  /v1/account/* — email/Telegram auth + 7-day trial`);
    console.log(`  GET  /v1/sync/* — linked account settings & history`);
    console.log(`  GET  /v1/billing/status — tier, limits, trial/premium`);
    console.log(`  POST /v1/llm/probe — test LLM key via BFF (no key logging)`);
    console.log(`  POST /v1/story/full — story + optional Yandex TTS`);
    console.log(`  POST /v1/story/feedback — like/dislike + reason tags`);
    console.log(`  GET  /health — health check`);
    console.log(`  GET  /audio/* — signed audio only`);
    console.log(`[boot] phone backend URL must be http://YOUR_PC_IP:${PORT} (not Railway)`);
  });

  server.on('connection', (socket) => {
    const peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? '?'}`;
    console.log(`[tcp] connect ${peer}`);
  });

  function shutdown(signal: string): void {
    console.log(`[shutdown] ${signal} — closing HTTP server`);
    server.close(async () => {
      await closePostgres();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

boot().catch((err) => {
  console.error('[boot] fatal:', err);
  process.exit(1);
});
