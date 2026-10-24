// Browser helper: asks our own server to read a message. Returns null if unavailable.
export async function analyze(text) {
  try {
    const r = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }), signal: AbortSignal.timeout(10000),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Shared events from the server; null when it is unreachable (the app then uses sample data only). */
export async function loadEvents() {
  try {
    const r = await fetch("/api/events", { signal: AbortSignal.timeout(6000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
/** Resolves to {status, ...body}, or null when the server cannot be reached. */
export async function publishEvent(event, poster) {
  try {
    const r = await fetch("/api/events", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, poster }), signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch { return null; }
}

/** Community doubts for one event; null when the server is unreachable. */
export async function loadDoubts(id) {
  try { const r = await fetch(`/api/events/${id}/doubts`, { signal: AbortSignal.timeout(6000) }); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function postDoubt(id, body) {
  try {
    const r = await fetch(`/api/events/${id}/doubts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return { status: r.status };
  } catch { return null; }
}
