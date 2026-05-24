import type { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const install = req.installId?.slice(0, 8) ?? '-';

  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms install=${install}`);
  });

  next();
}
