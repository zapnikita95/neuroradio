import type { Request } from 'express';

const activeByInstall = new Map<string, AbortController>();

export class StoryRequestAbortedError extends Error {
  readonly reason: 'superseded' | 'client_disconnect';

  constructor(reason: 'superseded' | 'client_disconnect') {
    super(`Story request aborted (${reason})`);
    this.name = 'StoryRequestAbortedError';
    this.reason = reason;
  }
}

/** One in-flight story per install — new POST cancels the previous. */
export function claimStoryGeneration(installId: string, req: Request): AbortSignal {
  const key = installId.trim().toLowerCase();
  activeByInstall.get(key)?.abort('superseded');

  const ctrl = new AbortController();
  activeByInstall.set(key, ctrl);

  req.on('close', () => {
    if (activeByInstall.get(key) === ctrl) {
      activeByInstall.delete(key);
      if (!ctrl.signal.aborted) ctrl.abort('client_disconnect');
    }
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
  const reason = signal.reason === 'superseded' ? 'superseded' : 'client_disconnect';
  console.log(`[story] abort at ${phase} reason=${reason}`);
  throw new StoryRequestAbortedError(reason);
}
