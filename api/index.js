// Vercel serverless entry. vercel.json rewrites every /api/* call here with the original path in ?__p=.
// Storage: Upstash Redis / Vercel KV when its env vars exist (recommended), otherwise a temporary /tmp file.
import { createApi } from "../server/app.js";
import { createEventStore } from "../server/events.js";
import { pickKv } from "../server/kv.js";

const store = createEventStore(pickKv());
const api = createApi({ key: process.env.OPENROUTER_API_KEY, store });
const HEAD = { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };

export function resolvePath(url) {
  const u = new URL(url, "http://x"), p = u.searchParams.get("__p");
  return p !== null ? `/api/${p.replace(/^\/+/, "")}` : u.pathname;
}

export default async function handler(req, res) {
  try {
    if (!(await api(req, res, resolvePath(req.url)))) { res.writeHead(404, HEAD); res.end('{"error":"Not found"}'); }
  } catch {
    if (!res.headersSent) { res.writeHead(500, HEAD); res.end('{"error":"Server error"}'); } else res.end();
  }
}
