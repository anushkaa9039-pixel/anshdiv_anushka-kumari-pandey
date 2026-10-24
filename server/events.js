// Persistent store (JSON file, atomic writes, serialized): events, posters and per-event doubt threads.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { validateEvent, sniffImage, dateIn } from "../src/core.js";

/** Returns {mime, bytes} for a real PNG/JPEG/WebP data URL under 2 MB, else null. */
export function parsePoster(p) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof p === "string" ? p : "");
  if (!m || m[2].length > 2_000_000) return null;
  const bytes = Buffer.from(m[2], "base64");
  return sniffImage(bytes) === m[1] ? { mime: m[1], bytes } : null;
}
const clean = (v, max) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s.length <= max ? s : ""; };

export function createEventStore(file, { max = 200 } = {}) {
  let data = null, queue = Promise.resolve();
  const load = async () => {
    if (data) return data;
    try { data = JSON.parse(await readFile(file, "utf8")); } catch { data = null; }
    if (!data || !Array.isArray(data.events)) data = { events: [] };
    data.posters ??= {}; data.doubts ??= {};
    return data;
  };
  const write = (fn) => (queue = queue.catch(() => {}).then(async () => {
    const r = await fn(await load());
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(data));
    await rename(`${file}.tmp`, file);
    return r;
  }));
  return {
    /** Upcoming events only (event date, or registration deadline while the date is unannounced). */
    async all(now = new Date()) { const t = dateIn(0, now); return (await load()).events.filter((e) => (e.date ?? e.regDeadline) >= t); },
    async poster(id) { return parsePoster((await load()).posters[id]); },
    async add(input, posterDataUrl = null, now = new Date()) {
      const r = validateEvent(input, now);
      if (!r.ok) return { ok: false, errors: r.errors };
      const poster = posterDataUrl ? parsePoster(posterDataUrl) : null;
      if (posterDataUrl && !poster) return { ok: false, errors: { poster: "Invalid poster" } };
      const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const event = { id, ...r.value, poster: poster ? `/api/poster/${id}` : null };
      await write((d) => {
        d.events.unshift(event);
        if (poster) d.posters[id] = posterDataUrl;
        for (const old of d.events.splice(max)) { delete d.posters[old.id]; delete d.doubts[old.id]; }
      });
      return { ok: true, event };
    },
    async doubts(eventId) { return (await load()).doubts[eventId] ?? []; },
    /** Community Q&A: a question, or a reply to an existing question. Anyone can answer. */
    async addDoubt(eventId, { name, text, replyTo = null }) {
      const t = clean(text, 300), n = clean(name, 30) || "Guest";
      if (!t) return { ok: false, error: "Write 1 to 300 characters." };
      if (replyTo !== null && !Number.isInteger(replyTo)) return { ok: false, error: "Bad reply target." };
      return write((d) => {
        if (!d.doubts[eventId] && Object.keys(d.doubts).length >= 500) return { ok: false, error: "Too many discussions." };
        const list = (d.doubts[eventId] ??= []);
        if (replyTo !== null && !list.some((x) => x.id === replyTo && x.replyTo === null)) return { ok: false, error: "Question not found." };
        const item = { id: (list.at(-1)?.id ?? 0) + 1, name: n, text: t, replyTo, at: Date.now() };
        list.push(item);
        if (list.length > 100) list.shift();
        return { ok: true, item };
      });
    },
  };
}
