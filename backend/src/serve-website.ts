import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Маркетинговый сайт (efir-ai.ru) лежит в папке `website/` в корне репозитория.
 * В production-образе он копируется рядом с бэкендом (см. корневой Dockerfile),
 * поэтому пробуем несколько кандидатов и берём тот, где есть index.html.
 */
export function resolveWebsiteDir(baseDir: string): string | null {
  const candidates = [
    process.env.WEBSITE_DIR?.trim(),
    path.resolve(baseDir, '../website'), // prod: /app/dist -> /app/website
    path.resolve(baseDir, '../../website'), // local: backend/dist -> repo/website
    path.resolve(baseDir, '../../../website'),
  ].filter((p): p is string => Boolean(p));

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Раздаёт статический сайт с заголовками, дружелюбными к SEO/AEO
 * (в отличие от API, где стоит noindex). Несуществующие пути отдаёт дальше,
 * чтобы работали /health, /v1/* и /audio/*.
 */
export function serveWebsite(dir: string): express.RequestHandler {
  const staticHandler = express.static(dir, {
    index: 'index.html',
    extensions: ['html'],
    dotfiles: 'ignore',
    setHeaders(res, filePath) {
      res.setHeader('X-Robots-Tag', 'index, follow');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (/\.(css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else if (/\.apk$/i.test(filePath)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Cache-Control', 'public, max-age=300');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    },
  });

  return (req, res, next) => {
    if (req.method === 'GET' && (req.path === '/privacy' || req.path === '/privacy/')) {
      res.sendFile(path.join(dir, 'privacy.html'));
      return;
    }
    staticHandler(req, res, next);
  };
}
