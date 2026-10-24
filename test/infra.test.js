import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../server/limiter.js";
import { createCache } from "../server/cache.js";

test("limiter blocks after max hits and recovers after the window", () => {
  let t = 0;
  const limited = createLimiter({ max: 2, windowMs: 100, now: () => t });
  assert.deepEqual([limited("a"), limited("a"), limited("a")], [false, false, true]);
  assert.equal(limited("b"), false);
  t = 101;
  assert.equal(limited("a"), false);
});
test("limiter caps memory by evicting stale keys", () => {
  let t = 0;
  const limited = createLimiter({ max: 5, windowMs: 10, maxKeys: 3, now: () => t });
  for (let i = 0; i < 4; i++) limited(`k${i}`);
  t = 50;
  assert.equal(limited("new"), false);
});
test("cache evicts least recently used and expires entries", () => {
  let t = 0;
  const c = createCache({ max: 2, ttlMs: 100, now: () => t });
  c.set("a", 1); c.set("b", 2); c.get("a"); c.set("c", 3);
  assert.deepEqual([c.get("a"), c.get("b"), c.get("c")], [1, undefined, 3]);
  t = 200;
  assert.equal(c.get("a"), undefined);
});
