import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const logPath = process.env.LOCAL_LOG_FILE?.trim();
if (logPath) {
  const filePath = logPath;
  mkdirSync(dirname(filePath), { recursive: true });

  function formatArgs(args: unknown[]): string {
    return args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.stack ?? a.message;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  }

  function tee(level: string, args: unknown[]): void {
    const line = `[${new Date().toISOString()}] [${level}] ${formatArgs(args)}\n`;
    try {
      appendFileSync(filePath, line, 'utf8');
    } catch {
      /* ignore disk errors */
    }
  }

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      tee(method, args);
    };
  }

  console.log(`[boot] file log → ${filePath}`);
}
