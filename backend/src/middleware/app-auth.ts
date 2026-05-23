import { Request, Response, NextFunction } from 'express';
import { getAllowedPackageName, getAuthJwtSecret, verifyJwt } from '../services/jwt.js';
import { rateLimitStory } from './rate-limit.js';

declare global {
  namespace Express {
    interface Request {
      installId?: string;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization')?.trim();
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function requireAppAuth(req: Request, res: Response, next: NextFunction): void {
  const jwtSecret = getAuthJwtSecret();
  if (!jwtSecret) {
    res.status(503).json({ error: 'Server auth is not configured' });
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = verifyJwt(token, jwtSecret);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (payload.pkg && payload.pkg !== getAllowedPackageName()) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  req.installId = payload.sub;
  rateLimitStory(payload.sub)(req, res, next);
}
