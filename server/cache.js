// Small LRU cache with TTL. Saves repeat model calls (cost and latency).
export function createCache({ max = 200, ttlMs = 36e5, now = Date.now } = {}) {
  const m = new Map();
  return {
    get(k) {
      const v = m.get(k);
      if (!v) return undefined;
      if (now() - v.t > ttlMs) { m.delete(k); return undefined; }
      m.delete(k); m.set(k, v);
      return v.val;
    },
    set(k, val) { m.delete(k); m.set(k, { val, t: now() }); if (m.size > max) m.delete(m.keys().next().value); },
    get size() { return m.size; },
  };
}
