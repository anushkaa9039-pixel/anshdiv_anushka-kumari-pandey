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

// ---- audience network, organizer tools, shared RSVP counts. All resolve to {status, ...body}, or null when the server is unreachable.
const JSON_H = { "Content-Type": "application/json" };
async function call(url, init, ms = 8000) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch { return null; }
}
const keyHeaders = (token, admin) => ({ "x-manage-token": token ?? "", ...(admin ? { "x-admin-key": admin } : {}) });
export const savePerson = (id, rec) => call("/api/people", { method: "PUT", headers: JSON_H, body: JSON.stringify({ id, ...rec }) });
export const dropPerson = (id) => call("/api/people", { method: "DELETE", headers: JSON_H, body: JSON.stringify({ id }) });
export const fetchAudience = (q) => call("/api/audience", { method: "POST", headers: JSON_H, body: JSON.stringify(q) });
export const updateEvent = (id, token, event, poster, admin, keepPoster = null) => call(`/api/events/${id}`, { method: "PUT", headers: { ...JSON_H, ...keyHeaders(token, admin) }, body: JSON.stringify({ event, poster, keepPoster }) }, 15000);
export const deleteEvent = (id, token, admin) => call(`/api/events/${id}`, { method: "DELETE", headers: keyHeaders(token, admin) });
export const sendRsvp = (id, device, going) => call(`/api/events/${id}/rsvp`, { method: "POST", headers: JSON_H, body: JSON.stringify({ device, going }) });

/** Expands a shortened Google Maps link; resolves to the long link, or null. */
export const resolveMap = async (u) => { try { const r = await fetch(`/api/resolve-map?u=${encodeURIComponent(u)}`, { signal: AbortSignal.timeout(8000) }); return r.ok ? (await r.json()).url : null; } catch { return null; } };
