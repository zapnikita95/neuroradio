/** Thrown when fact sources returned nothing — do not call LLM (prevents theme hallucinations). */
export class NoReferenceFactsError extends Error {
  readonly code = 'NO_REFERENCE_FACTS';

  constructor(artist: string, title: string) {
    super(`No reference facts for ${artist} — ${title}`);
    this.name = 'NoReferenceFactsError';
  }
}

export function isNoReferenceFactsError(err: unknown): err is NoReferenceFactsError {
  return err instanceof NoReferenceFactsError || (err as { code?: string })?.code === 'NO_REFERENCE_FACTS';
}
