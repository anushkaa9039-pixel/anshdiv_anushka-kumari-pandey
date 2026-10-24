import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze as defaultAnalyze } from "./decide.js";
import { createLimiter } from "./limiter.js";
import { createCache } from "./cache.js";
import { createEventStore, parsePoster } from "./events.js";
import { validateEvent } from "../src/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { // allow-list: nothing else on disk is ever served
  "/": ["index.html", "text/html"], "/index.html": ["index.html", "text/html"],
  "/src/app.js": ["src/app.js", "text/javascript"], "/src/api.js": ["src/api.js", "text/javascript"],
  "/src/core.js": ["src/core.js", "text/javascript"], "/src/data.js": ["src/data.js", "text/javascript"],
  "/src/dom.js": ["src/dom.js", "text/javascript"], "/src/detail.js": ["src/detail.js", "text/javascript"], "/src/store.js": ["src/store.js", "text/javascript"],
  "/src/style.css": ["src/style.css", "text/css"],
};
for (let i = 1; i <= 13; i++) FILES[`/posters/${i}.svg`] = [`posters/${i}.svg`, "image/svg+xml"]; // demo poster art
export const HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://maps.google.com https://www.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Cache-Control": "no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
const J = "application/json";
const send = (res, code, body, type = J, extra = {}) => { res.writeHead(code, { ...HEADERS, "Content-Type": type, ...extra }); res.end(body); };
const err = (res, code, text, extra) => send(res, code, JSON.stringify({ error: text }), J, extra);

/** Builds (but does not start) the HTTP server. Dependencies are injectable for tests. */
export function createApp({ analyzeFn = defaultAnalyze, key, limit = {}, store = createEventStore(path.join(root, "data", "events.json")) } = {}) {
  const limited = createLimiter(limit);
  const writeLimited = createLimiter({ max: 10 });
  const cache = createCache();

  async function readBody(req, limit) {
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > limit) return null; }
    return raw;
  }
  const isJson = (req) => (req.headers["content-type"] ?? "").startsWith(J);

  async function handle(req, res) {
    const { pathname } = new URL(req.url, "http://x");
    if (pathname === "/api/analyze") {
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "POST" });
      if (!(req.headers["content-type"] ?? "").startsWith(J)) return err(res, 415, "Send JSON");
      if (limited(req.socket.remoteAddress)) return err(res, 429, "Too many requests", { "Retry-After": "60" });
      const raw = await readBody(req, 2048);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" });
      let text;
      try { text = JSON.parse(raw).text; } catch { return err(res, 400, "Bad request"); }
      if (typeof text !== "string" || !text.trim() || text.length > 1000) return err(res, 400, "Bad request");
      let out = cache.get(text);
      if (!out) {
        out = await analyzeFn(text, { key });
        if (out.source === "model") cache.set(text, out); // never cache fallbacks
      }
      const { source, ...pub } = out; // internal detail, never sent to the browser
      return send(res, 200, JSON.stringify(pub));
    }
    if (pathname === "/api/events") {
      if (req.method === "GET") return send(res, 200, JSON.stringify(await store.all()));
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "GET, POST" });
      if (!isJson(req)) return err(res, 415, "Send JSON");
      if (writeLimited(req.socket.remoteAddress)) return err(res, 429, "Too many requests", { "Retry-After": "60" });
      const raw = await readBody(req, 2_300_000);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" });
      let body;
      try { body = JSON.parse(raw); } catch { return err(res, 400, "Bad request"); }
      if (!body || typeof body.event !== "object" || body.event === null) return err(res, 400, "Bad request");
      if (body.poster && !parsePoster(body.poster)) return err(res, 400, "Bad poster");
      const v = validateEvent(body.event);
      if (!v.ok) return send(res, 400, JSON.stringify({ error: "Invalid event", errors: v.errors }));
      const review = await analyzeFn(`${v.value.title}. ${v.value.desc}`, { key });
      if (review.isEvent === false) return err(res, 422, "This does not look like a real event");
      const r = await store.add(body.event, body.poster ?? null);
      return send(res, 201, JSON.stringify({ event: r.event }));
    }
    const dm = /^\/api\/events\/(\d{1,16})\/doubts$/.exec(pathname);
    if (dm) {
      if (req.method === "GET") return send(res, 200, JSON.stringify(await store.doubts(dm[1])));
      if (req.method !== "POST") return err(res, 405, "Method not allowed", { Allow: "GET, POST" });
      if (!isJson(req)) return err(res, 415, "Send JSON");
      if (writeLimited(req.socket.remoteAddress)) return err(res, 429, "Too many requests", { "Retry-After": "60" });
      const raw = await readBody(req, 2048);
      if (raw === null) return err(res, 413, "Too large", { Connection: "close" });
      let b;
      try { b = JSON.parse(raw); } catch { return err(res, 400, "Bad request"); }
      if (!b || typeof b.text !== "string") return err(res, 400, "Bad request");
      const r = await store.addDoubt(dm[1], { name: b.name, text: b.text, replyTo: b.replyTo ?? null });
      return r.ok ? send(res, 201, JSON.stringify({ item: r.item })) : err(res, 400, r.error);
    }
    const pm = /^\/api\/poster\/(\d+)$/.exec(pathname);
    if (pm) {
      if (req.method !== "GET") return err(res, 405, "Method not allowed", { Allow: "GET" });
      const p = await store.poster(pm[1]);
      if (!p) return send(res, 404, "Not found", "text/plain");
      res.writeHead(200, { ...HEADERS, "Content-Type": p.mime, "Cache-Control": "public, max-age=3600" });
      return res.end(p.bytes);
    }
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
