import { Request, Response, NextFunction } from 'express';
import { verifyAudioAccess } from '../services/audio-token.js';

export function requireSignedAudioAccess(req: Request, res: Response, next: NextFunction): void {
  const fileName = req.path.replace(/^\//, '');
  if (!fileName) {
    res.status(404).end();
    return;
  }

  try {
    const ok = verifyAudioAccess(
      fileName,
      typeof req.query.exp === 'string' ? req.query.exp : undefined,
      typeof req.query.sig === 'string' ? req.query.sig : undefined,
    );
    if (!ok) {
      res.status(403).json({ error: 'Invalid or expired audio link' });
      return;
    }
    next();
  } catch {
    res.status(400).json({ error: 'Invalid audio request' });
  }
}
