// Pure logic: no DOM access, fully unit-tested.
export const INTERESTS = [["software", "Software Dev"], ["web", "Web Dev"], ["mobile", "App Dev"], ["ai", "AI & ML"], ["data", "Data Science"], ["cyber", "Cyber Security"], ["blockchain", "Blockchain"], ["cloud", "Cloud & DevOps"], ["iot", "IoT & Robotics"], ["design", "Design & UX"], ["startup", "Startups"], ["career", "Careers"], ["gaming", "Gaming & Esports"], ["music", "Music"], ["art", "Art & Film"], ["social", "Community & Social"]];
const IDS = INTERESTS.map(([id]) => id), LABEL = Object.fromEntries(INTERESTS);
export const LEVELS = ["all", "student", "pro"];
export const EVENT_TYPES = ["hackathon", "workshop", "meetup", "conference", "summit"];
export const HOST_TYPES = ["college", "startup", "company", "community"];
export const MODES = ["offline", "online", "hybrid"];
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD"];
export const BENEFITS = [["certificate", "Certificate"], ["prizes", "Prizes"], ["internship", "Internship or job chance"], ["swag", "Goodies"], ["food", "Food"], ["mentorship", "Mentorship"]];
const BEN_IDS = BENEFITS.map(([id]) => id);
export const CITIES = [
  { name: "Bhopal", state: "Madhya Pradesh", country: "India", lat: 23.2599, lng: 77.4126 }, { name: "Indore", state: "Madhya Pradesh", country: "India", lat: 22.7196, lng: 75.8577 },
  { name: "Delhi", state: "Delhi", country: "India", lat: 28.6139, lng: 77.209 }, { name: "Mumbai", state: "Maharashtra", country: "India", lat: 19.076, lng: 72.8777 },
  { name: "Pune", state: "Maharashtra", country: "India", lat: 18.5204, lng: 73.8567 }, { name: "Bengaluru", state: "Karnataka", country: "India", lat: 12.9716, lng: 77.5946 },
  { name: "Hyderabad", state: "Telangana", country: "India", lat: 17.385, lng: 78.4867 }, { name: "Chennai", state: "Tamil Nadu", country: "India", lat: 13.0827, lng: 80.2707 },
  { name: "Kolkata", state: "West Bengal", country: "India", lat: 22.5726, lng: 88.3639 }, { name: "Singapore", state: "", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { name: "London", state: "England", country: "United Kingdom", lat: 51.5072, lng: -0.1276 },
];
export const eventLabel = (id) => id[0].toUpperCase() + id.slice(1);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const two = (n) => String(n).padStart(2, "0");
export const hueOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/** Great-circle distance in km (1 decimal). */
export function haversine(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(x)) * 10) / 10;
}

/** Pull coordinates out of a full Google Maps link. Returns null for anything else. */
export function parseMapLink(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== "https:" || !/^(www\.|maps\.)?google\.[a-z.]+$/.test(u.hostname)) return null;
  const m = u.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.href.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  if (!m || !inRange(+m[1], +m[2])) return null;
  return { lat: +m[1], lng: +m[2] };
}

const HOSTS = { whatsapp: ["chat.whatsapp.com", "wa.me"], instagram: ["instagram.com", "www.instagram.com"], linkedin: ["linkedin.com", "www.linkedin.com", "in.linkedin.com"] };
/** "" = empty, null = invalid, string = cleaned https link. */
export function safeLink(kind, raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.username || u.password || u.protocol !== "https:") return null;
  if (kind === "website") return u.hostname.includes(".") && s.length <= 200 ? u.href : null;
  if (!HOSTS[kind].includes(u.hostname) || u.pathname.length < 2) return null;
  return u.origin + u.pathname;
}
export function validatePoster(f) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(f?.type)) return "Use a PNG, JPG or WebP image.";
  return f.size > 1.5e6 ? "Keep the poster under 1.5 MB." : "";
}

// ---- dates (all YYYY-MM-DD, local calendar days)
export function isoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const dateIn = (n, now = new Date()) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
export function daysUntil(date, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
}
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(iso, now = new Date()) {
  const n = daysUntil(iso, now);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}, ${d} ${MONTH[m - 1]}`;
}
export function deadlineInfo(e, now = new Date()) {
  if (!e.regDeadline) return { text: "", state: "none" };
  const n = daysUntil(e.regDeadline, now);
  if (n < 0) return { text: "Registration closed", state: "closed" };
  if (n === 0) return { text: "Registration closes today", state: "soon" };
  if (n <= 7) return { text: `Registration closes in ${n} ${n === 1 ? "day" : "days"}`, state: "soon" };
  return { text: `Register by ${formatDate(e.regDeadline, now)}`, state: "open" };
}
export const formatPrice = (price, cur = "INR") => (price === 0 ? "Free" : new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(price));
export const formatKm = (km) => (km == null ? "" : km < 100 ? `${km} km` : `${Math.round(km).toLocaleString("en")} km`);

// ---- matching and search
/** What a person's past RSVPs say about them: counts per domain, event type and host. */
export function affinity(history = []) {
  const a = { interests: {}, types: {}, hosts: {} };
  for (const h of history) {
    for (const i of h.interests ?? []) a.interests[i] = (a.interests[i] ?? 0) + 1;
    a.types[h.type] = (a.types[h.type] ?? 0) + 1;
    const k = String(h.host ?? "").toLowerCase();
    a.hosts[k] = (a.hosts[k] ?? 0) + 1;
  }
  return a;
}
/** 0-100 fit from profile interests plus past participation; null when there is nothing to go on. */
export function matchScore(e, p, aff = null) {
  const pi = p?.interests ?? [];
  if (!pi.length && !aff) return null;
  const hit = e.interests.filter((i) => pi.includes(i)).length;
  const lvl = !p || e.level === "all" || e.level === p.level ? 20 : 0;
  let s = Math.round((70 * hit) / e.interests.length) + lvl + (e.km == null ? 5 : e.km <= 5 ? 10 : e.km <= 15 ? 5 : 0);
  if (aff) s += Math.min(15, 5 * e.interests.filter((i) => aff.interests[i]).length) + (aff.types[e.type] ? 5 : 0) + (aff.hosts[e.host.toLowerCase()] ? 5 : 0);
  return Math.min(100, s);
}
/** Plain-language "why this is suggested for you" (empty when there is no reason). */
export function suggestReason(e, p, aff = null) {
  const parts = [], shared = e.interests.filter((i) => p?.interests?.includes(i)).map((i) => LABEL[i]);
  if (shared.length) parts.push(`you like ${shared.join(" and ")}`);
  if (aff?.hosts[e.host.toLowerCase()]) parts.push(`you joined ${e.host} before`);
  else if (aff?.types[e.type]) parts.push(`you joined a ${e.type} before`);
  else { const h = e.interests.find((i) => aff?.interests[i]); if (h) parts.push(`you joined ${LABEL[h]} events before`); }
  return parts.join(" and ");
}
export const searchText = (e) => [e.title, e.host, e.type, e.mode === "online" ? "online virtual" : "in-person offline", e.city, e.state, e.country, e.venue, ...e.interests.map((i) => LABEL[i]), ...(e.benefits ?? [])].filter(Boolean).join(" ").toLowerCase();

/** Everything upcoming that matches; nearby in-person events first, then best match, then soonest. */
export function rank(events, { origin = null, nearbyKm = 25, interest = "all", type = "all", mode = "all", when = "any", price = "any", query = "", profile = null, following = [], history = [], now = new Date() } = {}) {
  const aff = history.length ? affinity(history) : null;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean), fol = new Set(following);
  const urgency = (e) => e.day ?? e.deadlineDays;
  return events
    .map((e) => {
      const km = origin && e.lat != null ? haversine(origin, e) : null;
      return { ...e, km, day: e.date ? daysUntil(e.date, now) : null, deadlineDays: e.regDeadline ? daysUntil(e.regDeadline, now) : null,
        nearby: km !== null && km <= nearbyKm && e.mode !== "online", followed: fol.has(e.host.toLowerCase()) };
    })
    .filter((e) => urgency(e) >= 0)
    .filter((e) => (interest === "all" || e.interests.includes(interest)) && (type === "all" || e.type === type))
    .filter((e) => mode === "all" || (mode === "online" ? e.mode !== "offline" : e.mode !== "online"))
    .filter((e) => price === "any" || e.price === 0)
    .filter((e) => when === "any" || (when === "week" && urgency(e) <= 7) || (when === "month" && urgency(e) <= 30) || (when === "closing" && e.deadlineDays !== null && e.deadlineDays <= 7))
    .filter((e) => { const t = searchText(e); return tokens.every((k) => t.includes(k)); })
    .map((e) => { const m = matchScore(e, profile, aff); return { ...e, match: e.followed ? Math.min(100, (m ?? 0) + 15) : m }; })
    .sort((a, b) => Number(b.nearby) - Number(a.nearby) || (b.match ?? 0) - (a.match ?? 0) || urgency(a) - urgency(b));
}

// ---- posting
export function validateEvent(i, now = new Date()) {
  const errors = {}, text = (v) => String(v ?? "").trim();
  const title = text(i.title), host = text(i.host), desc = text(i.desc);
  if (title.length < 4 || title.length > 70) errors.title = "Use 4 to 70 characters.";
  if (host.length < 2 || host.length > 40) errors.host = "Use 2 to 40 characters.";
  if (desc.length < 20 || desc.length > 800) errors.desc = "Use 20 to 800 characters.";
  const interests = [...new Set(i.interests ?? [])].filter((x) => IDS.includes(x));
  if (!interests.length || interests.length > 4) errors.interests = "Pick 1 to 4 domains.";
  if (!EVENT_TYPES.includes(i.type)) errors.type = "Pick an event type.";
  if (!HOST_TYPES.includes(i.hostType)) errors.hostType = "Pick who is hosting.";
  const mode = MODES.includes(i.mode) ? i.mode : null;
  if (!mode) errors.mode = "Pick how people attend.";

  let lat = null, lng = null, city = "", state = "", country = "", venue = "";
  if (mode && mode !== "online") {
    lat = i.lat == null ? NaN : Number(i.lat); lng = i.lng == null ? NaN : Number(i.lng);
    if (!inRange(lat, lng)) errors.loc = "Pin the location first.";
    city = text(i.city); country = text(i.country); state = text(i.state).slice(0, 40); venue = text(i.venue).slice(0, 80);
    if (city.length < 2 || city.length > 40) errors.city = "Enter the city.";
    if (country.length < 2 || country.length > 40) errors.country = "Enter the country.";
  }

  const today = dateIn(0, now);
  let date = null, time = null, regDeadline = null;
  const dl = text(i.regDeadline);
  if (dl) { if (!isoDate(dl)) errors.regDeadline = "Pick a valid date."; else if (dl < today) errors.regDeadline = "The deadline can't be in the past."; else regDeadline = dl; }
  if (i.dateMode === "tbd") {
    if (!dl) errors.regDeadline = "Add the registration deadline while the date is not final.";
  } else {
    const d = text(i.date);
    if (!isoDate(d)) errors.date = "Pick the event date."; else if (d < today) errors.date = "The date can't be in the past."; else date = d;
    time = /^([01]\d|2[0-3]):[0-5]\d$/.test(i.time ?? "") ? i.time : "18:00";
    if (date && regDeadline && regDeadline > date) errors.regDeadline = "The deadline must be on or before the event date.";
  }

  const priceRaw = text(i.price), price = priceRaw === "" ? 0 : Number(priceRaw);
  if (!Number.isFinite(price) || price < 0 || price > 1e6) errors.price = "Enter 0 or a valid amount.";
  const benefits = [...new Set(i.benefits ?? [])].filter((x) => BEN_IDS.includes(x));
  const prizeNote = text(i.prizeNote);
  if (prizeNote.length > 80) errors.prizeNote = "Keep this under 80 characters.";
  const num = (v) => (text(v) === "" ? null : Number(v));
  const teamMin = num(i.teamMin), teamMax = num(i.teamMax), badN = (x) => x !== null && (!Number.isInteger(x) || x < 1 || x > 50);
  if (badN(teamMin) || badN(teamMax)) errors.team = "Team size must be a whole number from 1 to 50.";
  else if (teamMin !== null && teamMax !== null && teamMin > teamMax) errors.team = "The minimum can't be more than the maximum.";
  const rules = text(i.rules);
  if (rules.length > 400) errors.rules = "Keep rules under 400 characters.";

  const eligibility = text(i.eligibility);
  if (eligibility.length > 300) errors.eligibility = "Keep this under 300 characters.";
  const feeUnit = i.feeUnit === "team" ? "team" : "person";

  const regStartRaw = text(i.regStart);
  let regStart = null;
  if (regStartRaw) {
    if (!isoDate(regStartRaw)) errors.regStart = "Pick a valid date.";
    else if ((regDeadline ?? date) && regStartRaw > (regDeadline ?? date)) errors.regStart = "Registration can't open after it closes.";
    else regStart = regStartRaw;
  }
  const timeline = [];
  for (const t of Array.isArray(i.timeline) ? i.timeline.slice(0, 5) : []) {
    const label = text(t?.label), d = text(t?.date);
    if (!label && !d) continue;
    if (label.length < 3 || label.length > 40 || !isoDate(d)) { errors.timeline = "Each key date needs a name (3 to 40 characters) and a valid date."; break; }
    timeline.push({ label, date: d });
  }
  timeline.sort((a, b) => a.date.localeCompare(b.date));
  const prizes = [];
  for (const p of Array.isArray(i.prizes) ? i.prizes.slice(0, 5) : []) {
    const place = text(p?.place), reward = text(p?.reward);
    if (!place && !reward) continue;
    if (place.length < 2 || place.length > 30 || reward.length < 2 || reward.length > 60) { errors.prizes = "Each prize needs a position (2 to 30 characters) and a reward (2 to 60)."; break; }
    prizes.push({ place, reward });
  }

  const contactEmail = text(i.contactEmail);
  if (contactEmail.length > 100 || !/^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(contactEmail)) errors.contactEmail = "Enter an email people can reach you on.";
  const contactPhone = text(i.contactPhone), contactName = text(i.contactName);
  if (contactPhone && !telHref(contactPhone)) errors.contactPhone = "Use 7 to 15 digits, like +91 98765 43210.";
  if (contactName.length > 40) errors.contactName = "Keep this under 40 characters.";
  const faqs = [];
  for (const f of Array.isArray(i.faqs) ? i.faqs.slice(0, 5) : []) {
    const q = text(f?.q), a = text(f?.a);
    if (!q && !a) continue;
    if (q.length < 3 || q.length > 120 || a.length < 3 || a.length > 300) { errors.faqs = "Each FAQ needs a question (3 to 120 characters) and an answer (3 to 300)."; break; }
    faqs.push({ q, a });
  }
  const whatsapp = safeLink("whatsapp", i.whatsapp), instagram = safeLink("instagram", i.instagram), linkedin = safeLink("linkedin", i.linkedin), website = safeLink("website", i.website);
  if (whatsapp === null) errors.whatsapp = "Use a chat.whatsapp.com or wa.me link.";
  if (instagram === null) errors.instagram = "Use an instagram.com link.";
  if (linkedin === null) errors.linkedin = "Use a linkedin.com link.";
  if (website === null) errors.website = "Use a full https:// link.";

  const ok = !Object.keys(errors).length;
  return { ok, errors, value: ok ? {
    title, host, desc, interests, type: i.type, hostType: i.hostType, level: LEVELS.includes(i.level) ? i.level : "all", mode,
    venue, city, state, country, lat, lng, date, time, regDeadline, price, currency: CURRENCIES.includes(i.currency) ? i.currency : "INR",
    benefits, prizeNote, teamMin, teamMax, aiTools: ["allowed", "not_allowed"].includes(i.aiTools) ? i.aiTools : "na",
    interCollege: ["yes", "no"].includes(i.interCollege) ? i.interCollege : "na", rules, contactEmail, faqs, whatsapp, instagram, linkedin, website, joined: 0,
    regStart, timeline, prizes, feeUnit, eligibility, contactPhone, contactName,
  } : null };
}

/** Deterministic sample community: most people near Bhopal, the rest spread across other cities. */
export function makePeople(n = 240, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => { let t = (s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return Array.from({ length: n }, (_, id) => {
    const set = new Set();
    for (let k = 1 + Math.floor(rnd() * 3); set.size < k; ) set.add(IDS[Math.floor(rnd() * IDS.length)]);
    const far = rnd() < 0.35, c = far ? CITIES[1 + Math.floor(rnd() * (CITIES.length - 1))] : CITIES[0];
    const r = rnd() ** 0.7 * (far ? 15 : 18), a = rnd() * 6.283;
    return { id, interests: [...set], level: rnd() < 0.6 ? "student" : "pro",
      lat: c.lat + (r / 111) * Math.sin(a), lng: c.lng + (r / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.cos(a) };
  });
}
/** Organizer's audience finder. Pass radiusKm = Infinity for online reach. */
export function reach(e, people, radiusKm) {
  const tops = {};
  let count = 0;
  for (const p of people) {
    if (radiusKm !== Infinity && haversine(p, e) > radiusKm) continue;
    if (e.level !== "all" && e.level !== p.level) continue;
    const common = p.interests.filter((x) => e.interests.includes(x));
    if (!common.length) continue;
    count++;
    for (const x of common) tops[x] = (tops[x] ?? 0) + 1;
  }
  return { count, total: people.length, tops: Object.entries(tops).sort((a, b) => b[1] - a[1]) };
}

export function streak(weeks) {
  const set = new Set(weeks);
  if (!set.size) return 0;
  let w = Math.max(...set), n = 0;
  while (set.has(w)) { n++; w--; }
  return n;
}
export const weekOf = (d = new Date()) => Math.floor(d.getTime() / 6048e5);

const DOMAIN_RULES = [["cyber", /\b(cyber|ctf|security|hacking|pentest)/i], ["blockchain", /\b(blockchain|web3|crypto|ethereum|solidity)/i], ["ai", /\b(ai|ml|machine learning|llm|genai)\b/i], ["data", /\b(data science|analytics|data)\b/i], ["web", /\b(web|react|frontend|javascript)/i], ["mobile", /\b(android|ios|flutter|app dev)/i], ["cloud", /\b(cloud|devops|aws|azure|kubernetes)/i], ["iot", /\b(iot|robotic|arduino|embedded)/i], ["design", /\b(design|ux|ui|figma)\b/i], ["startup", /\b(startup|founder|pitch|incubat)/i], ["career", /\b(intern|resume|placement|job|career)/i], ["gaming", /\b(gaming|esports|board game|chess)/i], ["music", /\b(music|mic|band|concert)/i], ["art", /\b(art|film|sketch|poetry|photography)/i], ["software", /\b(hack|code|coding|dev|software|open source|app)/i]];
/** Local fallback reader for pasted chat messages (the server upgrades topic with a model). */
export function parseEventText(raw) {
  const text = String(raw ?? "").slice(0, 1000);
  const first = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const t = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  let time = "18:00";
  if (t) time = `${two((Number(t[1]) % 12) + (/pm/i.test(t[3]) ? 12 : 0))}:${t[2] ?? "00"}`;
  const title = first.replace(/[*_~#]/g, "").replace(/\b(today|tonight|tomorrow)\b/gi, "").replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, "").replace(/\b(online|virtual)\b|\bon (zoom|google meet)\b/gi, "")
    .replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").slice(0, 70);
  const kinds = [["hackathon", /\bhack/i], ["workshop", /\b(workshop|bootcamp|clinic)/i], ["conference", /\b(conference|conf)\b/i], ["summit", /\bsummit/i]];
  const rules = [["tech", /\b(hack|code|dev|ai|open source|app)/i], ["career", /\b(intern|resume|placement|startup|pitch|job)/i], ["arts", /\b(art|music|mic|sketch|poetry|film)/i]];
  const online = /\b(online|virtual|zoom|google meet|webinar)\b/i.test(text);
  return {
    title, time, topic: (rules.find(([, r]) => r.test(text)) ?? ["social"])[0], type: (kinds.find(([, r]) => r.test(text)) ?? ["meetup"])[0],
    day: /\btomorrow\b/i.test(text) ? 1 : /\b(today|tonight)\b/i.test(text) ? 0 : null,
    domain: DOMAIN_RULES.find(([, r]) => r.test(text))?.[0] ?? null,
    mode: online ? (/\bhybrid\b/i.test(text) ? "hybrid" : "online") : "offline",
  };
}

export function shareKit(e, when) {
  const at = e.time ? `${when}, ${e.time}` : when, tag = e.interests?.[0] ?? "events";
  return {
    WhatsApp: `*${e.title}*\n${e.host} | ${at}\nTap "I'm in" on Nukkad so we know you're coming.`,
    LinkedIn: `Join us: ${e.title}, hosted by ${e.host}. ${at}. Open to everyone.`,
    Instagram: `${e.title}\n${at}\n#${tag} #events #nukkad`,
  };
}
export function cleanName(raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  return /^\p{L}[\p{L} '\-]{0,29}$/u.test(s) ? s[0].toUpperCase() + s.slice(1) : "";
}
export const reasons = (e, p) => (p?.interests ? e.interests.filter((i) => p.interests.includes(i)) : []);
export function sniffImage(b) {
  if (b?.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b?.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b?.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}
export const greeting = (hour) => (hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

const esc = (s) => String(s).replace(/[\\;,]/g, "\\$&").replace(/\r?\n/g, "\\n");
const stamp = (d) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}T${two(d.getHours())}${two(d.getMinutes())}00`;
const dayStamp = (d) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
/** When an event goes on a calendar: a timed slot for the event, or an all-day reminder for the deadline while the date is unannounced. */
export function calendarSlot(e) {
  if (e.date) {
    const [y, m, d] = e.date.split("-").map(Number), [hh, mm] = (e.time ?? "18:00").split(":").map(Number);
    const start = new Date(y, m - 1, d, hh, mm), end = new Date(start.getTime() + 2 * 36e5);
    return { allDay: false, summary: e.title, start: stamp(start), end: stamp(end) };
  }
  const [y, m, d] = e.regDeadline.split("-").map(Number);
  return { allDay: true, summary: `Registration closes: ${e.title}`, start: dayStamp(new Date(y, m - 1, d)), end: dayStamp(new Date(y, m - 1, d + 1)) };
}
const calPlace = (e) => [e.venue, e.city].filter(Boolean).join(", ") || "Online";
export function icsFor(e, now = new Date()) {
  const s = calendarSlot(e);
  const when = s.allDay ? [`DTSTART;VALUE=DATE:${s.start}`, `DTEND;VALUE=DATE:${s.end}`] : [`DTSTART:${s.start}`, `DTEND:${s.end}`];
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nukkad//EN", "BEGIN:VEVENT", `UID:${e.id}@nukkad`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    ...when, `SUMMARY:${esc(s.summary)}`, `DESCRIPTION:${esc(`${e.desc} Hosted by ${e.host}.`)}`, `LOCATION:${esc(calPlace(e))}`,
    ...(e.lat != null ? [`GEO:${e.lat};${e.lng}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
/** "Add to Google Calendar" link. Times are floating, so Google shows them in the viewer's own time zone. */
export function googleCalUrl(e) {
  const s = calendarSlot(e), q = new URLSearchParams({ action: "TEMPLATE", text: s.summary, dates: `${s.start}/${s.end}`, details: `${e.desc} Hosted by ${e.host}. Found on Nukkad.`.slice(0, 900), location: calPlace(e) });
  return `https://calendar.google.com/calendar/render?${q}`;
}
/** Safe download name such as "build-night-ship-it.ics". */
export const icsFilename = (e) => `${String(e.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event"}.ics`;
/** "" when the number isn't plausible, else a tel: link built from digits only (never from raw input). */
export function telHref(raw) {
  const s = String(raw ?? "").trim(), digits = s.replace(/\D/g, "");
  return /^\+?[\d\s().-]{7,25}$/.test(s) && digits.length >= 7 && digits.length <= 15 ? `tel:${s.startsWith("+") ? "+" : ""}${digits}` : "";
}
export const inviteLink = (e, when) => `https://wa.me/?text=${encodeURIComponent(`${e.title} | ${e.time ? `${when}, ${e.time}` : when}. Come with me! Found on Nukkad.`)}`;
export const safePoster = (p) => (typeof p === "string" && (/^\/(api\/poster\/\d+|posters\/\d+\.svg)$/.test(p) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p)) ? p : null);
