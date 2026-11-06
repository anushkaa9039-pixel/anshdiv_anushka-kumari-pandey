// Persistent store: events, posters and per-event doubt threads, on top of a key-value backend (see kv.js).
import { validateEvent, sniffImage, dateIn } from "../src/core.js";
import { createFileKv } from "./kv.js";

/** Returns {mime, bytes} for a real PNG/JPEG/WebP data URL under 2 MB, else null. */
export function parsePoster(p) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof p === "string" ? p : "");
  if (!m || m[2].length > 2_000_000) return null;
  const bytes = Buffer.from(m[2], "base64");
  return sniffImage(bytes) === m[1] ? { mime: m[1], bytes } : null;
}
const clean = (v, max) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s.length <= max ? s : ""; };
const dupKey = (e) => [e.title, e.host, e.date ?? "", e.regDeadline ?? ""].join("|").toLowerCase();

/** `target` is a JSON file path or a kv backend. */
export function createEventStore(target, { max = 300 } = {}) {
  const kv = typeof target === "string" ? createFileKv(target) : target;
  let queue = Promise.resolve();
  const lock = (fn) => (queue = queue.catch(() => {}).then(fn));
  const events = async () => { const v = await kv.get("events"); return Array.isArray(v) ? v : []; };
  const dropDoubts = async (id) => {
    await kv.del(`doubts:${id}`);
    const idx = (await kv.get("doubtIdx")) ?? [];
    if (idx.includes(String(id))) await kv.set("doubtIdx", idx.filter((x) => x !== String(id)));
  };
  return {
    kv,
    /** Upcoming events only (event date, or registration deadline while the date is unannounced). */
    async all(now = new Date()) { const t = dateIn(0, now); return (await events()).filter((e) => (e.date ?? e.regDeadline) >= t); },
    async poster(id) { return parsePoster(await kv.get(`poster:${id}`)); },
    async add(input, posterDataUrl = null, now = new Date()) {
      const r = validateEvent(input, now);
      if (!r.ok) return { ok: false, errors: r.errors };
      const poster = posterDataUrl ? parsePoster(posterDataUrl) : null;
      if (posterDataUrl && !poster) return { ok: false, errors: { poster: "Invalid poster" } };
      if (posterDataUrl && kv.maxValue && posterDataUrl.length > kv.maxValue) return { ok: false, errors: { poster: "Poster is too large" } };
      return lock(async () => {
        let list = await events();
        if (list.some((e) => dupKey(e) === dupKey(r.value))) return { ok: false, duplicate: true, errors: { title: "This event is already posted." } };
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const event = { id, ...r.value, poster: poster ? `/api/poster/${id}` : null };
        const t = dateIn(0, now), expired = list.filter((e) => (e.date ?? e.regDeadline) < t);
        list = list.filter((e) => !expired.includes(e));
        list.unshift(event);
        const dropped = [...expired, ...list.splice(max)];
        if (poster) await kv.set(`poster:${id}`, posterDataUrl);
        await kv.set("events", list);
        for (const o of dropped) { await kv.del(`poster:${o.id}`); await dropDoubts(o.id); }
        return { ok: true, event };
      });
    },
    async doubts(eventId) { return (await kv.get(`doubts:${eventId}`)) ?? []; },
    /** Community Q&A: a question, or a reply to an existing question. Anyone can answer. */
    async addDoubt(eventId, { name, text, replyTo = null }) {
      const t = clean(text, 300), n = clean(name, 30) || "Guest";
      if (!t) return { ok: false, error: "Write 1 to 300 characters." };
      if (replyTo !== null && !Number.isInteger(replyTo)) return { ok: false, error: "Bad reply target." };
      return lock(async () => {
        const key = `doubts:${eventId}`, list = (await kv.get(key)) ?? [];
        if (!list.length) {
          const idx = (await kv.get("doubtIdx")) ?? [];
          if (idx.length >= 500) return { ok: false, error: "Too many discussions." };
          if (!idx.includes(String(eventId))) await kv.set("doubtIdx", [...idx, String(eventId)]);
        }
        if (replyTo !== null && !list.some((x) => x.id === replyTo && x.replyTo === null)) return { ok: false, error: "Question not found." };
        const item = { id: (list.at(-1)?.id ?? 0) + 1, name: n, text: t, replyTo, at: Date.now() };
        list.push(item);
        if (list.length > 100) list.shift();
        await kv.set(key, list);
        return { ok: true, item };
      });
    },
  };
}
