import type { Request, Response } from 'express';

const activeByInstall = new Map<string, AbortController>();

export class StoryRequestAbortedError extends Error {
  readonly reason: 'client_disconnect';

  constructor(reason: 'client_disconnect') {
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

  req.on('aborted', () => abortClientDisconnect(key, ctrl));
  res.on('close', () => {
    if (!res.writableEnded) abortClientDisconnect(key, ctrl);
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

function abortClientDisconnect(key: string, ctrl: AbortController): void {
  if (activeByInstall.get(key) !== ctrl) return;
  activeByInstall.delete(key);
  if (!ctrl.signal.aborted) ctrl.abort('client_disconnect');
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
  console.log(`[story] abort at ${phase} reason=client_disconnect`);
  throw new StoryRequestAbortedError('client_disconnect');
}
