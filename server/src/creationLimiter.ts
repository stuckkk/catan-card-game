/** How many sessions one network address may create per window. Above the per-server limit
 *  (MAX_SESSIONS) this keeps a single client from filling the server by itself. */
export const DEFAULT_CREATES_PER_WINDOW = 10
export const DEFAULT_CREATE_WINDOW_MS = 10 * 60 * 1000

export class CreationLimiter {
  /** Per address: when its recent creations happened. */
  private recent = new Map<string, number[]>()

  constructor(
    private readonly max: number = DEFAULT_CREATES_PER_WINDOW,
    private readonly windowMs: number = DEFAULT_CREATE_WINDOW_MS,
  ) {}

  /** Whether `address` may create a session now; if so, it is counted. */
  allow(address: string, now: number = Date.now()): boolean {
    for (const [key, times] of this.recent) {
      const kept = times.filter(t => now - t < this.windowMs)
      if (kept.length > 0) this.recent.set(key, kept)
      else this.recent.delete(key)
    }
    const times = this.recent.get(address) ?? []
    if (times.length >= this.max) return false
    this.recent.set(address, [...times, now])
    return true
  }
}
