// Fixed-window rate limiter with a hard cap on tracked keys (no unbounded memory growth).
export function createLimiter({ max = 20, windowMs = 6e4, maxKeys = 5000, now = Date.now } = {}) {
  const hits = new Map();
  return (key) => {
    const t = now();
    if (hits.size > maxKeys) for (const [k, v] of hits) if (t - v.t > windowMs) hits.delete(k);
    if (hits.size > maxKeys) hits.clear();
    const h = hits.get(key);
    if (!h || t - h.t > windowMs) { hits.set(key, { n: 1, t }); return false; }
    return ++h.n > max;
  };
}
