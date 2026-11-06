// Shared Vercel serverless handler. Every file under /api re-exports this, so Vercel's own file-based routing
// (api/health.js -> /api/health, api/events/[id]/doubts.js -> /api/events/:id/doubts, ...) needs no rewrites.
// Storage: Upstash Redis / Vercel KV when its env vars exist (recommended), otherwise a temporary /tmp file.
import { createApi } from "./app.js";
import { createEventStore } from "./events.js";
import { pickKv } from "./kv.js";

const store = createEventStore(pickKv());
const api = createApi({ key: process.env.OPENROUTER_API_KEY, store });
const HEAD = { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };

/** The public API path, e.g. /api/events/123/doubts. Copes with a ?__p= rewrite and with an unfilled [id] placeholder. */
export function resolvePath(url, query = {}) {
  const u = new URL(url, "http://x"), p = u.searchParams.get("__p");
  if (p !== null) return `/api/${p.replace(/^\/+/, "")}`;
  let path = u.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  const id = query?.id ?? u.searchParams.get("id");
  if (path.includes("[id]") && id) path = path.replace("[id]", String(id).replace(/\D/g, ""));
  return path;
}

export default async function handler(req, res) {
  try {
    if (!(await api(req, res, resolvePath(req.url, req.query)))) { res.writeHead(404, HEAD); res.end('{"error":"Not found"}'); }
  } catch {
    if (!res.headersSent) { res.writeHead(500, HEAD); res.end('{"error":"Server error"}'); } else res.end();
  }
}
