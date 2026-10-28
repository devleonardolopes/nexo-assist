/** Janela deslizante em memória, por chave (IP). Suficiente para proteger um deploy de demonstração. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs = 60_000,
  ) {}

  allow(key: string, at = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => at - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(at);
    this.hits.set(key, recent);
    return true;
  }
}
