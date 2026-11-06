// Audience network: people who chose to be counted by organizers. Anonymous by design:
// no name, no contact details, location rounded to ~1 km. Identified only by a random id kept on their own device.
import { INTERESTS, haversine } from "../src/core.js";

const IDS = INTERESTS.map(([id]) => id);
export const PERSON_ID = /^[a-f0-9]{32}$/;
const MAX_PEOPLE = 1500, TTL_MS = 180 * 864e5;
const round2 = (n) => Math.round(n * 100) / 100;

/** Validates what a browser sends about a person. Returns the stored record or null. */
export function cleanPerson(i, now = Date.now()) {
  if (!i || typeof i !== "object") return null;
  const interests = [...new Set(Array.isArray(i.interests) ? i.interests : [])].filter((x) => IDS.includes(x)).slice(0, 5);
  const past = {};
  for (const [k, v] of Object.entries(i.past && typeof i.past === "object" ? i.past : {})) {
    const n = Math.min(99, Math.floor(Number(v)));
    if (IDS.includes(k) && n >= 1) past[k] = n;
  }
  if (!interests.length && !Object.keys(past).length) return null;
  let lat = null, lng = null;
  if (i.lat != null && i.lng != null && Number.isFinite(+i.lat) && Number.isFinite(+i.lng) && Math.abs(+i.lat) <= 90 && Math.abs(+i.lng) <= 180) { lat = round2(+i.lat); lng = round2(+i.lng); }
  return { interests, past, level: i.level === "pro" ? "pro" : "student", lat, lng, at: now };
}

/**
 * Counts people an event could reach. Someone matches when a domain they like now, or a domain of events they joined before,
 * is one of the event's domains. radiusKm = null means "anywhere"; `all` is always the anywhere count.
 */
export function summarize(map, { interests = [], level = "all", lat = null, lng = null, radiusKm = null } = {}) {
  const want = interests.filter((x) => IDS.includes(x)), tops = {};
  let count = 0, all = 0, interested = 0, returning = 0;
  const total = Object.keys(map).length;
  for (const p of Object.values(map)) {
    if (level !== "all" && p.level !== level) continue;
    const now = p.interests.filter((x) => want.includes(x)), before = want.filter((x) => p.past[x]);
    if (!now.length && !before.length) continue;
    all++;
    if (radiusKm != null) { if (p.lat == null || lat == null || haversine(p, { lat, lng }) > radiusKm) continue; }
    count++;
    if (now.length) interested++;
    if (before.length) returning++;
    for (const x of new Set([...now, ...before])) tops[x] = (tops[x] ?? 0) + 1;
  }
  return { count, all, interested, returning, total, tops: Object.entries(tops).sort((a, b) => b[1] - a[1]) };
}

export function createPeopleStore(kv) {
  let queue = Promise.resolve();
  const lock = (fn) => (queue = queue.catch(() => {}).then(fn));
  const load = async () => { const v = await kv.get("people"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; };
  return {
    async upsert(id, input, now = Date.now()) {
      const rec = cleanPerson(input, now);
      if (!PERSON_ID.test(String(id)) || !rec) return { ok: false };
      return lock(async () => {
        const m = await load();
        m[id] = rec;
        for (const [k, v] of Object.entries(m)) if (now - v.at > TTL_MS) delete m[k];
        const keys = Object.keys(m).sort((a, b) => m[a].at - m[b].at);
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PEOPLE))) delete m[k];
        await kv.set("people", m);
        return { ok: true };
      });
    },
    async remove(id) {
      if (!PERSON_ID.test(String(id))) return { ok: false };
      return lock(async () => { const m = await load(); if (id in m) { delete m[id]; await kv.set("people", m); } return { ok: true }; });
    },
    async audience(query) { return summarize(await load(), query); },
  };
}
