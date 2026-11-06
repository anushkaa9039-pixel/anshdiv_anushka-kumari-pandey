// Tiny key-value layer so the same app runs on a laptop (JSON file), in Docker, and on Vercel (Upstash Redis / Vercel KV over REST).
// Zero dependencies: Redis is reached through its REST API with fetch.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** In-memory store (tests, or a last-resort fallback). */
export function createMemoryKv() {
  const m = new Map();
  return {
    kind: "memory",
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async set(k, v) { m.set(k, structuredClone(v)); },
    async del(k) { m.delete(k); },
  };
}

/** One JSON file with atomic writes. Survives restarts on a normal server. */
export function createFileKv(file) {
  let data = null, queue = Promise.resolve();
  const load = async () => {
    if (data) return data;
    try { data = JSON.parse(await readFile(file, "utf8")); } catch { data = null; }
    if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    return data;
  };
  const save = () => (queue = queue.catch(() => {}).then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(data));
    await rename(`${file}.tmp`, file);
  }));
  return {
    kind: "file",
    async get(k) { const d = await load(); return k in d ? structuredClone(d[k]) : null; },
    async set(k, v) { (await load())[k] = v; await save(); },
    async del(k) { const d = await load(); if (k in d) { delete d[k]; await save(); } },
  };
}

/** Upstash Redis / Vercel KV through the REST API. Shared by every serverless instance. */
export function createRedisKv({ url, token, fetchImpl = fetch }) {
  const cmd = async (...args) => {
    const r = await fetchImpl(url, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(6000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `KV ${r.status}`);
    return j.result;
  };
  return {
    kind: "redis",
    maxValue: 900_000, // Upstash free tier rejects requests over 1 MB
    async get(k) { const v = await cmd("GET", k); return v == null ? null : JSON.parse(v); },
    async set(k, v) { await cmd("SET", k, JSON.stringify(v)); },
    async del(k) { await cmd("DEL", k); },
    /** Counter with expiry, used for rate limiting across instances. */
    async incr(k, ttlSec) { const n = await cmd("INCR", k); if (n === 1) await cmd("EXPIRE", k, ttlSec); return n; },
  };
}

/** Picks the best storage for the environment. */
export function pickKv(env = process.env, dataFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "events.json")) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return createRedisKv({ url, token });
  // Vercel's disk is read-only except /tmp, and /tmp is wiped. Works for a demo, but connect Upstash Redis for real persistence.
  return createFileKv(env.VERCEL ? "/tmp/nukkad-events.json" : dataFile);
}
