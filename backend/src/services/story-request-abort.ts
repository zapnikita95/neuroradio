import type { Request, Response } from 'express';

const activeByInstall = new Map<string, AbortController>();
const startedAtByInstall = new Map<string, number>();

export type StoryAbortReason =
  | 'client_cancel'
  | 'connection_closed'
  | 'client_timeout_likely';

export class StoryRequestAbortedError extends Error {
  readonly reason: StoryAbortReason;

  constructor(reason: StoryAbortReason) {
    super(`Story request aborted (${reason})`);
    this.name = 'StoryRequestAbortedError';
    this.reason = reason;
  }
}

export class StoryRequestDuplicateError extends Error {
  constructor() {
    super('Story request already in progress');
    this.name = 'StoryRequestDuplicateError';
  }
}

/** One in-flight story per install — duplicate POST is rejected, never aborts the active one. */
export function claimStoryGeneration(installId: string, req: Request, res: Response): AbortSignal {
  const key = installId.trim().toLowerCase();
  const existing = activeByInstall.get(key);
  if (existing && !existing.signal.aborted) {
    throw new StoryRequestDuplicateError();
  }

  const ctrl = new AbortController();
  activeByInstall.set(key, ctrl);
  startedAtByInstall.set(key, Date.now());

  req.on('aborted', () => abortStoryRequest(key, ctrl, 'client_cancel'));
  res.on('close', () => {
    if (!res.writableEnded) abortStoryRequest(key, ctrl, 'connection_closed');
  });

  ctrl.signal.addEventListener(
    'abort',
    () => {
      if (activeByInstall.get(key) === ctrl) activeByInstall.delete(key);
    },
    { once: true },
  );

  return ctrl.signal;
}

function abortStoryRequest(
  key: string,
  ctrl: AbortController,
  via: 'client_cancel' | 'connection_closed',
): void {
  if (activeByInstall.get(key) !== ctrl) return;
  activeByInstall.delete(key);
  const elapsedMs = Date.now() - (startedAtByInstall.get(key) ?? Date.now());
  startedAtByInstall.delete(key);
  let reason: StoryAbortReason = via;
  if (via === 'connection_closed' && elapsedMs >= 25_000 && elapsedMs <= 65_000) {
    reason = 'client_timeout_likely';
  }
  if (!ctrl.signal.aborted) ctrl.abort(reason);
}

export function releaseStoryGeneration(installId: string, signal: AbortSignal): void {
  const key = installId.trim().toLowerCase();
  for (const [id, ctrl] of activeByInstall) {
    if (id === key && ctrl.signal === signal) {
      activeByInstall.delete(id);
      break;
    }
  }
}

export function throwIfStoryAborted(signal: AbortSignal, phase: string): void {
  if (!signal.aborted) return;
  const raw = typeof signal.reason === 'string' ? signal.reason : 'connection_closed';
  const reason: StoryAbortReason =
    raw === 'client_cancel' || raw === 'connection_closed' || raw === 'client_timeout_likely'
      ? raw
      : 'connection_closed';
  const hint =
    reason === 'client_timeout_likely'
      ? ' (client/proxy likely timed out — not necessarily user cancel)'
      : reason === 'client_cancel'
        ? ' (HTTP request aborted — track skip or app cancel)'
        : ' (connection closed before response sent)';
  console.log(`[story] abort at ${phase} reason=${reason}${hint}`);
  throw new StoryRequestAbortedError(reason);
}
