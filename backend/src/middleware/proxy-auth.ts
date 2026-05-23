import { Request, Response, NextFunction } from 'express';

export function requireProxySecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.PROXY_SECRET?.trim();
  if (!secret) {
    next();
    return;
  }
  if (req.header('x-music-story-secret') === secret) {
    next();
    return;
  }
  res.status(401).json({ error: 'Invalid or missing X-Music-Story-Secret header' });
}
