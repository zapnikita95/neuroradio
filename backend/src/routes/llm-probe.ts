import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  normalizeProbeProvider,
  probeLlmProvider,
  type LlmProbeInput,
} from '../services/llm-probe.js';

const router = Router();

router.use(requireAppAuth);

interface LlmProbeBody {
  llm_provider?: string;
  model?: string;
  groq_api_key?: string;
  gemini_api_key?: string;
  openrouter_api_key?: string;
}

function asOptionalKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

router.post('/probe', async (req: Request, res: Response) => {
  const body = req.body as LlmProbeBody;
  const provider = normalizeProbeProvider(body.llm_provider);
  if (!provider || provider === 'local') {
    res.status(400).json({
      ok: false,
      message: 'Укажи llm_provider: groq, gemini или openrouter',
    });
    return;
  }

  const installId = req.installId?.slice(0, 8) ?? 'unknown';
  const ownKey = Boolean(
    asOptionalKey(body.groq_api_key) ||
      asOptionalKey(body.gemini_api_key) ||
      asOptionalKey(body.openrouter_api_key),
  );
  console.log(`[llm-probe] start provider=${provider} ownKey=${ownKey} install=${installId}`);

  const input: LlmProbeInput = {
    provider,
    model: typeof body.model === 'string' ? body.model : undefined,
    clientKeys: {
      groq: asOptionalKey(body.groq_api_key),
      gemini: asOptionalKey(body.gemini_api_key),
      openrouter: asOptionalKey(body.openrouter_api_key),
    },
  };

  try {
    const result = await probeLlmProvider(input);
    console.log(
      `[llm-probe] done provider=${provider} ok=${result.ok} status=${result.httpStatus ?? '-'} install=${installId}`,
    );
    res.status(result.ok ? 200 : 503).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[llm-probe] error provider=${provider} install=${installId}: ${message.slice(0, 160)}`);
    res.status(503).json({ ok: false, message: message.slice(0, 300) });
  }
});

export default router;
