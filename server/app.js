import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze as defaultAnalyze } from "./decide.js";
import { createLimiter } from "./limiter.js";
import { createCache } from "./cache.js";
import { createEventStore, parsePoster } from "./events.js";
import { pickKv } from "./kv.js";
import { validateEvent } from "../src/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { // allow-list: nothing else on disk is ever served
  "/": ["index.html", "text/html"], "/index.html": ["index.html", "text/html"],
  "/src/app.js": ["src/app.js", "text/javascript"], "/src/api.js": ["src/api.js", "text/javascript"],
  "/src/core.js": ["src/core.js", "text/javascript"], "/src/data.js": ["src/data.js", "text/javascript"],
  "/src/dom.js": ["src/dom.js", "text/javascript"], "/src/detail.js": ["src/detail.js", "text/javascript"], "/src/store.js": ["src/store.js", "text/javascript"],
  "/src/style.css": ["src/style.css", "text/css"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"], "/icon.svg": ["icon.svg", "image/svg+xml"],
  "/icon-192.png": ["icon-192.png", "image/png"], "/icon-512.png": ["icon-512.png", "image/png"], "/og.png": ["og.png", "image/png"],
};
for (let i = 1; i <= 13; i++) FILES[`/posters/${i}.svg`] = [`posters/${i}.svg`, "image/svg+xml"]; // demo poster art
export const HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; frame-src https://maps.google.com https://www.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Cache-Control": "no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
const J = "application/json";
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
export function createApi({ analyzeFn = defaultAnalyze, key, limit = {}, store = createEventStore(pickKv()) } = {}) {
  const limited = createLimiter(limit);
  const writeLimited = createLimiter({ max: 10 });
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
      if (req.method === "GET") return send(res, 200, JSON.stringify(await store.all()), J, { "Cache-Control": "no-store" }), true;
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "GET, POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("write", req, writeLimited, 10)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
      const raw = await readBody(req, 2_300_000);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" }), true;
      let body;
      try { body = JSON.parse(raw); } catch { return err(res, 400, "Bad request"), true; }
      if (!body || typeof body.event !== "object" || body.event === null) return err(res, 400, "Bad request"), true;
      if (body.poster && !parsePoster(body.poster)) return err(res, 400, "Bad poster"), true;
      const v = validateEvent(body.event);
      if (!v.ok) return send(res, 400, JSON.stringify({ error: "Invalid event", errors: v.errors })), true;
      const review = await analyzeFn(`${v.value.title}. ${v.value.desc}`, { key });
      if (review.isEvent === false) return err(res, 422, "This does not look like a real event"), true;
      const r = await store.add(body.event, body.poster ?? null);
      if (r.duplicate) return send(res, 409, JSON.stringify({ error: "Already posted", errors: r.errors })), true;
      if (!r.ok) return send(res, 400, JSON.stringify({ error: "Invalid event", errors: r.errors })), true;
      return send(res, 201, JSON.stringify({ event: r.event })), true;
    }
    const dm = /^\/api\/events\/(\d{1,16})\/doubts$/.exec(pathname);
    if (dm) {
      if (req.method === "GET") return send(res, 200, JSON.stringify(await store.doubts(dm[1])), J, { "Cache-Control": "no-store" }), true;
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "GET, POST" }), true;
      if (!isJson(req)) return err(res, 415, "Send JSON"), true;
      if (await hit("write", req, writeLimited, 10)) return err(res, 429, "Too many requests", { "Retry-After": "60" }), true;
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
