/** Wall-clock checkpoints for one POST /v1/story/full — see where time goes in Railway logs. */
export class StoryTiming {
  private readonly t0 = Date.now();

  constructor(
    private readonly installId: string,
    private readonly artist: string,
    private readonly title: string,
  ) {}

  mark(phase: string, detail?: string): void {
    const ms = Date.now() - this.t0;
    const extra = detail ? ` ${detail}` : '';
    console.log(
      `[timing] +${ms}ms phase=${phase} install=${this.installId.slice(0, 8)} ` +
        `artist="${this.artist}" title="${this.title}"${extra}`,
    );
  }

  totalMs(): number {
    return Date.now() - this.t0;
  }

  elapsedMs(): number {
    return this.totalMs();
  }
}
