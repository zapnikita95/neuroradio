import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import { hasGroqApiKey } from '../services/groq.js';
import { requireProxySecret } from '../middleware/proxy-auth.js';

const router = Router();
router.use(requireProxySecret);
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

router.post('/chat/completions', async (req: Request, res: Response) => {
  if (!hasGroqApiKey()) {
    res.status(503).json({ error: 'GROQ_API_KEY is not configured on server' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY!.trim();

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(60000),
    });

    const body = await response.text();
    const contentType = response.headers.get('content-type') ?? 'application/json';
    res.status(response.status).type(contentType).send(body);
  } catch (err) {
    console.error('Groq proxy failed:', err);
    res.status(502).json({
      error: 'Groq proxy failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
