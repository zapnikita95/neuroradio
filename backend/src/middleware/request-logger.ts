import type { NextFunction, Request, Response } from 'express';
import { redactSecrets } from '../services/log-redact.js';

declare global {
  namespace Express {
    interface Response {
      locals: {
        logDetail?: string;
      };
    }
  }
}

export function setLogDetail(res: Response, detail: string): void {
  res.locals.logDetail = redactSecrets(detail.slice(0, 500));
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const method = req.method;
  const path = req.originalUrl;

  const install = req.installId?.slice(0, 8) ?? '-';
  const ip = req.ip ?? req.socket.remoteAddress ?? '?';
  console.log(`[http] --> ${method} ${path} from=${ip} install=${install}`);

  res.on('finish', () => {
    const ms = Date.now() - started;
    const install = req.installId?.slice(0, 8) ?? '-';
    const status = res.statusCode;
    const detail = res.locals.logDetail;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';
    const suffix = detail ? ` | ${detail}` : '';
    const line = `[http] ${method} ${path} ${status} ${ms}ms install=${install}${suffix}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  });

  next();
}
