import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze as defaultAnalyze } from "./decide.js";
import { createLimiter } from "./limiter.js";
import { createCache } from "./cache.js";
import { createEventStore, parsePoster } from "./events.js";
import { pickKv, createMemoryKv } from "./kv.js";
import { createPeopleStore, PERSON_ID } from "./people.js";
import { timingSafeEqual } from "node:crypto";
import { validateEvent, INTERESTS } from "../src/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { // allow-list: nothing else on disk is ever served
  "/": ["index.html", "text/html"], "/index.html": ["index.html", "text/html"],
  "/src/app.js": ["src/app.js", "text/javascript"], "/src/api.js": ["src/api.js", "text/javascript"],
  "/src/core.js": ["src/core.js", "text/javascript"], "/src/data.js": ["src/data.js", "text/javascript"], "/src/curated.js": ["src/curated.js", "text/javascript"],
  "/src/dom.js": ["src/dom.js", "text/javascript"], "/src/detail.js": ["src/detail.js", "text/javascript"], "/src/store.js": ["src/store.js", "text/javascript"],
  "/src/style.css": ["src/style.css", "text/css"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"], "/icon.svg": ["icon.svg", "image/svg+xml"],
  "/icon-192.png": ["icon-192.png", "image/png"], "/icon-512.png": ["icon-512.png", "image/png"], "/og.png": ["og.png", "image/png"],
};
for (let i = 1; i <= 13; i++) FILES[`/posters/${i}.svg`] = [`posters/${i}.svg`, "image/svg+xml"]; // demo poster art
for (const i of [9001, 9003, 9004, 9006, 9008, 9009, 9010, 9011]) FILES[`/posters/${i}.jpg`] = [`posters/${i}.jpg`, "image/jpeg"]; // real Mumbai event posters
export const HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; frame-src https://maps.google.com https://www.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Cache-Control": "no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
const J = "application/json";
const INTEREST_IDS = INTERESTS.map(([id]) => id);

/** "Now" on an Indian wall clock whatever the server's timezone (Vercel runs on UTC), so "today" and deadlines match what users see. */
export function istNow(d = new Date()) {
  const s = new Date(d.getTime() + 5.5 * 3600e3);
  return new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), s.getUTCHours(), s.getUTCMinutes());
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const send = (res, code, body, type = J, extra = {}) => { res.writeHead(code, { ...HEADERS, "Content-Type": type, ...extra }); res.end(body); };
const err = (res, code, text, extra) => send(res, code, JSON.stringify({ error: text }), J, extra);

/** The caller's address. Behind a trusted proxy (Vercel, or TRUST_PROXY=1) the socket is the proxy, so read the forwarded header. */
export function clientIp(req, env = process.env) {
  if (env.VERCEL || env.TRUST_PROXY) {
    const f = req.headers["x-vercel-forwarded-for"] ?? req.headers["x-real-ip"] ?? req.headers["x-forwarded-for"];
    if (f) return String(f).split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/** Reads at most `limit` bytes. Returns null when the body is bigger. Also copes with platforms that pre-parse the body. */
async function readBody(req, limit) {
  if (req.readableEnded && req.body !== undefined) {
    const raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
    return Buffer.byteLength(raw) > limit ? null : raw;
  }
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}
const isJson = (req) => (req.headers["content-type"] ?? "").startsWith(J);

/**
 * The JSON API as a function (req, res, pathname) -> true when it handled the request.
 * Used by the Node server and by the Vercel serverless entry (api/index.js).
 */
export function createApi({ analyzeFn = defaultAnalyze, key, limit = {}, store = createEventStore(pickKv()), adminKey = process.env.ADMIN_KEY, people = createPeopleStore(store.kv ?? createMemoryKv()) } = {}) {
  const limited = createLimiter(limit);
  const WRITE_MAX = limit.writeMax ?? 10;
  const writeLimited = createLimiter({ max: WRITE_MAX });
  const audLimited = createLimiter({ max: 40 });
  const isAdmin = (req) => Boolean(adminKey) && safeEq(req.headers["x-admin-key"] ?? "", adminKey);
  const token = (req) => String(req.headers["x-manage-token"] ?? "").slice(0, 100);
  const cache = createCache();
  // With a shared Redis the limit holds across serverless instances; otherwise it is per process. Fails open if Redis is down.
  const hit = async (bucket, req, local, max) => {
    const ip = clientIp(req);
    if (store.kv?.incr) { try { return (await store.kv.incr(`rl:${bucket}:${ip}`, 60)) > max; } catch { /* fall through */ } }
    return local(ip);
  };

  return async function api(req, res, pathname) {
    if (pathname === "/api/health") {
      if (req.method !== "GET") return err(res, 405, "Method not allowed", { Allow: "GET" }), true;
      return send(res, 200, JSON.stringify({ ok: true, storage: store.kv?.kind ?? "custom", ai: Boolean(key) })), true;
    }
    if (pathname === "/api/resolve-map") { // expands a shortened Google Maps share link (maps.app.goo.gl) so the browser can read the pin from it
      if (req.method !== "GET") return err(res, 405, "Method not allowed", { Allow: "GET" }), true;
      if (await hit("aud", req, audLimited, 40)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      let url = new URL(req.url, "http://x").searchParams.get("u") ?? "";
      const okHost = (h) => h === "maps.app.goo.gl" || h === "goo.gl" || /^(www\.|maps\.)?google\.[a-z.]+$/.test(h);
      try {
        for (let hop = 0; hop < 5; hop++) {
          const u = new URL(url);
          if (u.protocol !== "https:" || !okHost(u.hostname) || url.length > 600) return err(res, 400, "Use a Google Maps link"), true;
          const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0 (compatible; NukkadMapLink/1.0)" } });
          const loc = r.headers.get("location");
          if (!(r.status >= 300 && r.status < 400 && loc)) break;
          url = new URL(loc, u).href;
        }
        const f = new URL(url);
        if (!okHost(f.hostname) || /^goo\.gl$|^maps\.app\.goo\.gl$/.test(f.hostname)) return err(res, 422, "Could not read that link"), true;
        return send(res, 200, JSON.stringify({ url: f.href }), J, { "Cache-Control": "no-store" }), true;
      } catch { return err(res, 422, "Could not read that link"), true; }
    }
    if (pathname === "/api/analyze") {
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("analyze", req, limited, limit.max ?? 20)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 2048);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let text;
      try { text = JSON.parse(raw).text; } catch { return err(res, 400, "Bad request"), true; }
      if (typeof text !== "string" || !text.trim() || text.length > 1000) return err(res, 400, "Bad request"), true;
      let out = cache.get(text);
      if (!out) {
        out = await analyzeFn(text, { key });
        if (out.source === "model") cache.set(text, out); // never cache fallbacks
      }
      const { source, ...pub } = out; // internal detail, never sent to the browser
      return send(res, 200, JSON.stringify(pub)), true;
    }
    if (pathname === "/api/events") {
      if (req.method === "GET") return send(res, 200, JSON.stringify(await store.all(istNow())), J, { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30" }), true;
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "GET, POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("write", req, writeLimited, WRITE_MAX)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 2_300_000);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let body;
      try { body = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
      if (!body || typeof body.event !== "object" || body.event === null) return err(res, 400, "Bad request"), true;
      if (body.poster && !parsePoster(body.poster)) return err(res, 400, "Bad poster"), true;
      const v = validateEvent(body.event, istNow());
      if (!v.ok) return send(res, 400, JSON.stringify({ error: "Invalid event", errors: v.errors })), true;
      const review = await analyzeFn(`${v.value.title}. ${v.value.desc}`, { key });
      if (review.isEvent === false) return err(res, 422, "This does not look like a real event"), true;
      const r = await store.add(body.event, body.poster ?? null, istNow());
      if (r.duplicate) return send(res, 409, JSON.stringify({ error: "Already posted", errors: r.errors })), true;
      if (!r.ok) return send(res, 400, JSON.stringify({ error: "Invalid event", errors: r.errors })), true;
      return send(res, 201, JSON.stringify({ event: r.event, manageToken: r.token })), true;
    }
    if (pathname === "/api/people") {
      if (req.method !== "PUT" && req.method !== "DELETE") return err(res, 405, "Method not allowed", { Allow: "PUT, DELETE" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("write", req, writeLimited, WRITE_MAX)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 2048);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let b;
      try { b = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
      if (!b || typeof b.id !== "string" || !PERSON_ID.test(b.id)) return err(res, 400, "Bad request"), true;
      const r = req.method === "PUT" ? await people.upsert(b.id, b) : await people.remove(b.id);
      return (r.ok ? send(res, 200, '{"ok":true}') : err(res, 400, "Pick at least one interest")), true;
    }
    if (pathname === "/api/audience") {
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("aud", req, audLimited, 40)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 2048);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let b;
      try { b = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
      const num = (v) => (v == null ? null : Number.isFinite(+v) ? +v : NaN);
      const lat = num(b?.lat), lng = num(b?.lng), radiusKm = num(b?.radiusKm);
      const interests = Array.isArray(b?.interests) ? [...new Set(b.interests)].filter((x) => INTEREST_IDS.includes(x)).slice(0, 4) : [];
      if (!interests.length || [lat, lng, radiusKm].some(Number.isNaN) || (radiusKm !== null && (radiusKm <= 0 || radiusKm > 20000))
        || (lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) return err(res, 400, "Bad request"), true;
      return send(res, 200, JSON.stringify(await people.audience({ interests, level: ["student", "pro"].includes(b.level) ? b.level : "all", lat, lng, radiusKm })), J, { "Cache-Control": "no-store" }), true;
    }
    const em = /^\/api\/events\/(\d{1,16})$/.exec(pathname);
    if (em) {
      if (req.method !== "PUT" && req.method !== "DELETE") return err(res, 405, "Method not allowed", { Allow: "PUT, DELETE" }), true;
      if (await hit("write", req, writeLimited, WRITE_MAX)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const admin = isAdmin(req);
      let r;
      if (req.method === "DELETE") r = await store.remove(em[1], token(req), { admin });
      else {
        if (!isJson(req)) return err(res, 415, "Send JSON"), true;
        const raw = await readBody(req, 2_300_000);
        if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
        let b;
        try { b = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
        if (!b || typeof b.event !== "object" || b.event === null) return err(res, 400, "Bad request"), true;
        r = await store.update(em[1], token(req), b.event, b.poster ?? null, { admin, now: istNow(), keepPoster: b.keepPoster });
      }
      if (r.ok) return send(res, 200, JSON.stringify(r.event ? { event: r.event } : { ok: true })), true;
      return send(res, r.status ?? 400, JSON.stringify({ error: r.status === 403 ? "That management key does not match" : r.status === 404 ? "Event not found" : "Invalid event", errors: r.errors })), true;
    }
    const rm = /^\/api\/events\/(\d{1,16})\/rsvp$/.exec(pathname);
    if (rm) {
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("write", req, writeLimited, WRITE_MAX)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 512);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let b;
      try { b = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
      if (!b || typeof b.device !== "string" || !PERSON_ID.test(b.device) || typeof b.going !== "boolean") return err(res, 400, "Bad request"), true;
      const r = await store.rsvp(rm[1], b.device, b.going);
      return (r.ok ? send(res, 200, JSON.stringify({ joined: r.joined })) : err(res, r.status ?? 400, "Event not found")), true;
    }
    const dm = /^\/api\/events\/(\d{1,16})\/doubts$/.exec(pathname);
    if (dm) {
      if (req.method === "GET") return send(res, 200, JSON.stringify(await store.doubts(dm[1])), J, { "Cache-Control": "no-store" }), true;
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "GET, POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("write", req, writeLimited, WRITE_MAX)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 2048);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let b;
      try { b = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
      if (!b || typeof b.text !== "string") return err(res, 400, "Bad request"), true;
      const r = await store.addDoubt(dm[1], { name: b.name, text: b.text, replyTo: b.replyTo ?? null });
      return (r.ok ? send(res, 201, JSON.stringify({ item: r.item })) : err(res, 400, r.error)), true;
    }
    const pm = /^\/api\/poster\/(\d+)$/.exec(pathname);
    if (pm) {
      if (req.method !== "GET") return err(res, 405, "Method not allowed", { Allow: "GET" }), true;
      const p = await store.poster(pm[1]);
      if (!p) return send(res, 404, "Not found", "text/plain"), true;
      res.writeHead(200, { ...HEADERS, "Content-Type": p.mime, "Cache-Control": "public, max-age=3600" });
      return res.end(p.bytes), true;
    }
    return false;
  };
}

/** Builds (but does not start) the HTTP server. Dependencies are injectable for tests. */
export function createApp(opts = {}) {
  const api = createApi(opts);
  async function handle(req, res) {
    const { pathname } = new URL(req.url, "http://x");
    if (await api(req, res, pathname)) return;
    const f = FILES[pathname];
    if (!f) return send(res, 404, "Not found", "text/plain");
    if (req.method !== "GET") return send(res, 405, "Method not allowed", "text/plain", { Allow: "GET" });
    send(res, 200, await readFile(path.join(root, f[0])), `${f[1]}; charset=utf-8`);
  }
  const server = http.createServer(async (req, res) => {
    try { await handle(req, res); } catch { if (!res.headersSent) err(res, 500, "Server error"); else res.end(); }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  return server;
}
