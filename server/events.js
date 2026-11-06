// Persistent store: events, posters and per-event doubt threads, on top of a key-value backend (see kv.js).
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
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
// Same event even if spacing, case or punctuation differ.
const dupKey = (e) => [e.title, e.host, e.date ?? "", e.regDeadline ?? ""].join("|").toLowerCase().replace(/[^a-z0-9|]/g, "");
const sha = (t) => createHash("sha256").update(String(t)).digest("hex");
const sameHash = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const pub = ({ mh, ...e }) => e; // mh = hash of the organizer's management key; never sent to browsers
const owns = (e, token, admin) => admin || (Boolean(token) && Boolean(e.mh) && sameHash(sha(token), e.mh));

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
    async all(now = new Date()) { const t = dateIn(0, now); return (await events()).filter((e) => (e.date ?? e.regDeadline) >= t).map(pub); },
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
        const token = randomBytes(16).toString("hex");
        const event = { id, ...r.value, poster: poster ? `/api/poster/${id}` : null, mh: sha(token) };
        const t = dateIn(0, now), expired = list.filter((e) => (e.date ?? e.regDeadline) < t);
        list = list.filter((e) => !expired.includes(e));
        list.unshift(event);
        const dropped = [...expired, ...list.splice(max)];
        if (poster) await kv.set(`poster:${id}`, posterDataUrl);
        await kv.set("events", list);
        for (const o of dropped) { await kv.del(`poster:${o.id}`); await dropDoubts(o.id); }
        return { ok: true, event: pub(event), token };
      });
    },
    /** Organizer edit. `token` is the management key given at publish time; `admin` skips that check. */
    async update(id, token, input, posterDataUrl = null, { admin = false, now = new Date() } = {}) {
      const r = validateEvent(input, now);
      if (!r.ok) return { ok: false, status: 400, errors: r.errors };
      const poster = posterDataUrl ? parsePoster(posterDataUrl) : null;
      if (posterDataUrl && !poster) return { ok: false, status: 400, errors: { poster: "Invalid poster" } };
      if (posterDataUrl && kv.maxValue && posterDataUrl.length > kv.maxValue) return { ok: false, status: 400, errors: { poster: "Poster is too large" } };
      return lock(async () => {
        const list = await events(), i = list.findIndex((e) => String(e.id) === String(id));
        if (i < 0) return { ok: false, status: 404 };
        if (!owns(list[i], token, admin)) return { ok: false, status: 403 };
        if (list.some((e, j) => j !== i && dupKey(e) === dupKey(r.value))) return { ok: false, status: 409, errors: { title: "This event is already posted." } };
        const old = list[i];
        list[i] = { ...old, ...r.value, id: old.id, joined: old.joined ?? 0, mh: old.mh, poster: poster ? `/api/poster/${old.id}` : old.poster };
        if (poster) await kv.set(`poster:${old.id}`, posterDataUrl);
        await kv.set("events", list);
        return { ok: true, event: pub(list[i]) };
      });
    },
    async remove(id, token, { admin = false } = {}) {
      return lock(async () => {
        const list = await events(), i = list.findIndex((e) => String(e.id) === String(id));
        if (i < 0) return { ok: false, status: 404 };
        if (!owns(list[i], token, admin)) return { ok: false, status: 403 };
        list.splice(i, 1);
        await kv.set("events", list);
        await kv.del(`poster:${id}`); await kv.del(`rsvp:${id}`); await dropDoubts(id);
        return { ok: true };
      });
    },
    /** One "I'm in" per device. The count lives on the event so every visitor sees the same number. */
    async rsvp(id, device, going) {
      return lock(async () => {
        const list = await events(), e = list.find((x) => String(x.id) === String(id));
        if (!e) return { ok: false, status: 404 };
        const key = `rsvp:${id}`, set = (await kv.get(key)) ?? [], has = set.includes(device);
        if (going && !has && set.length < 5000) set.push(device);
        if (!going && has) set.splice(set.indexOf(device), 1);
        e.joined = set.length;
        await kv.set(key, set); await kv.set("events", list);
        return { ok: true, joined: set.length };
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
