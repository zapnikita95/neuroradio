import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import { countHotFacts } from '../services/fact-bank.js';

const router = Router();

router.use(requireAppAuth);

/** Fast check: is there a hot fact for this track? No fact text, no generation. */
router.get('/hint', (req: Request, res: Response) => {
  const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
  const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
  if (!artist || !title) {
    res.status(400).json({ error: 'artist and title required' });
    return;
  }
  const { hasHotFact, hotCount } = countHotFacts(artist, title);
  res.json({ hasHotFact, hotCount });
});

export default router;
