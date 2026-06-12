import { Request, Response, NextFunction } from 'express';
import {
  getAuthJwtSecret,
  isAllowedPackageName,
  isDesktopLikeClient,
  verifyJwt,
} from '../services/jwt.js';
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
    console.warn(`[auth] 503 no JWT secret path=${req.originalUrl}`);
    res.status(503).json({ error: 'Server auth is not configured' });
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    console.warn(`[auth] 401 no token path=${req.originalUrl} ip=${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = verifyJwt(token, jwtSecret);
  if (!payload) {
    console.warn(`[auth] 401 bad token path=${req.originalUrl} ip=${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!isDesktopLikeClient(payload.client) && payload.pkg && !isAllowedPackageName(String(payload.pkg))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  req.installId = payload.sub;
  next();
}
