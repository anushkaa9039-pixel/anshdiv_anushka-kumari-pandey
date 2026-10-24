// Pure view-model for the event page: turns one event into the sections people look for
// (details, dates and deadlines, prizes and fees, rules, FAQs, contact). No DOM access, fully unit-tested.
import { BENEFITS, INTERESTS, formatDate, formatKm, formatPrice, deadlineInfo, daysUntil, eventLabel, telHref } from "./core.js";

const BEN = Object.fromEntries(BENEFITS), LABEL = Object.fromEntries(INTERESTS);
export const MODE_TEXT = { offline: "In person", online: "Online", hybrid: "In person + online" };
const LEVEL_TEXT = { all: "Everyone", student: "Students", pro: "Professionals" };
export const TABS = [["details", "Details"], ["dates", "Dates & deadlines"], ["prizes", "Prizes & fees"], ["rules", "Rules & eligibility"], ["faqs", "FAQs"], ["contact", "Contact"]];

/** "25 Oct 2026": always with the year, so deadlines are never ambiguous. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const longDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const feeText = (e) => (e.price ? `${formatPrice(e.price, e.currency)} per ${e.feeUnit === "team" ? "team" : "person"}` : "Free");
export const teamText = (e) => (e.teamMax === 1 ? "Solo only" : e.teamMin && e.teamMax ? `${e.teamMin} to ${e.teamMax} members` : e.teamMin ? `At least ${e.teamMin} members` : e.teamMax ? `Up to ${e.teamMax} members` : "");
export const whenText = (e) => (e.date ? `${formatDate(e.date)}${e.time ? `, ${e.time}` : ""}` : "Date to be announced");
export const rulesList = (rules) => String(rules ?? "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);

/** "in 3 days", "today", "2 days ago". */
export function relative(iso, now = new Date()) {
  const n = daysUntil(iso, now);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** The four facts shown at the top of every event page. */
export function keyFacts(e, now = new Date()) {
  const dl = deadlineInfo(e, now), team = teamText(e);
  return [
    { label: "Register by", value: e.regDeadline ? longDate(e.regDeadline) : "Not specified", note: dl.text, tone: dl.state },
    { label: "Fee", value: feeText(e), note: e.prizeNote || "", tone: "none" },
    team ? { label: "Team size", value: team, note: "", tone: "none" } : { label: "Open to", value: LEVEL_TEXT[e.level] ?? "Everyone", note: "", tone: "none" },
    { label: "Attend", value: MODE_TEXT[e.mode] ?? "", note: e.mode === "online" ? "" : [e.city, e.state || e.country].filter(Boolean).join(", "), tone: "none" },
  ];
}

/** Everything on the dates tab, in calendar order. Unannounced dates stay visible as "to be announced". */
export function schedule(e, now = new Date()) {
  const items = [];
  const add = (label, date, kind = "K") => items.push({ label, kind, date, extra: "", text: date ? longDate(date) : "To be announced", past: date ? daysUntil(date, now) < 0 : false, when: date ? relative(date, now) : "" });
  if (e.regStart) add("Registration opens", e.regStart, "O");
  if (e.regDeadline) add("Registration closes", e.regDeadline, "C");
  for (const t of e.timeline ?? []) add(t.label, t.date);
  items.sort((a, b) => a.date.localeCompare(b.date));
  items.push(e.date ? { label: "Event day", kind: "E", date: e.date, text: longDate(e.date), extra: e.time ? `Starts ${e.time}` : "", past: daysUntil(e.date, now) < 0, when: relative(e.date, now) }
    : { label: "Event day", kind: "E", date: null, text: "To be announced", extra: "", past: false, when: "" });
  return items;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const CAL_KEYS = [["O", "Registration opens"], ["C", "Registration closes"], ["E", "Event day"], ["K", "Other key date"]];
/**
 * Month grids (Sunday first) covering every dated item, at most 4 months. Each day cell is null (padding) or
 * { day, iso, today, marks: [{ kind, label }] }.
 */
export function calendarMonths(items, now = new Date()) {
  const dated = items.filter((i) => i.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!dated.length) return [];
  const marks = {};
  for (const it of dated) (marks[it.date] ??= []).push({ kind: it.kind, label: it.label });
  const [y0, m0] = dated[0].date.split("-").map(Number), [y1, m1] = dated.at(-1).date.split("-").map(Number);
  const count = Math.min(4, (y1 - y0) * 12 + (m1 - m0) + 1), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return Array.from({ length: count }, (_, k) => {
    const y = y0 + Math.floor((m0 - 1 + k) / 12), m = (m0 - 1 + k) % 12;
    const lead = new Date(Date.UTC(y, m, 1)).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { day: i + 1, iso, today: iso === today, marks: marks[iso] ?? [] };
    })];
    while (cells.length % 7) cells.push(null);
    return { title: `${MONTH_NAMES[m]} ${y}`, weeks: Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7)) };
  });
}

/**
 * Content for each tab. `facts` rows are [label, text, optional href]; `bullets` are plain lines;
 * `links` are [text, https href]. `empty` is shown when the organiser left a tab blank.
 */
export function sections(e, { now = new Date(), where = "", going = 0 } = {}) {
  const dl = deadlineInfo(e, now), mail = e.contactEmail ? `mailto:${e.contactEmail}` : "", tel = telHref(e.contactPhone);
  const team = teamText(e), place = [e.venue, e.city, e.state, e.country].filter(Boolean).join(", ");
  const links = [["website", "Register or visit the website"], ["whatsapp", "Join the doubts community"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"]].filter(([k]) => e[k]).map(([k, t]) => [t, e[k]]);
  return {
    details: { facts: [["When", whenText(e)], ["Attend", MODE_TEXT[e.mode]], ...(e.mode !== "online" && place ? [["Where", place]] : []),
      ...(e.km != null ? [["Distance", `${formatKm(e.km)} from ${where}`]] : []), ["Hosted by", `${e.host} (${eventLabel(e.hostType)})`], ["Domains", e.interests.map((i) => LABEL[i]).join(", ")], ["Going", String(going)]],
      about: e.desc, bullets: [], links: [], empty: "" },
    dates: { facts: [], schedule: schedule(e, now), months: calendarMonths(schedule(e, now), now), note: dl.text, bullets: [], links: [], empty: "" },
    prizes: { facts: [["Fee", feeText(e)], ...(e.prizeNote ? [["Highlight", e.prizeNote]] : []), ["Benefits", e.benefits.map((b) => BEN[b]).join(" · ") || "None listed"]],
      prizes: e.prizes ?? [], bullets: [], links: [], empty: e.prizes?.length ? "" : "The organiser has not listed individual prizes yet. Ask in the FAQs tab." },
    rules: { facts: [["Open to", LEVEL_TEXT[e.level] ?? "Everyone"], ...(team ? [["Team size", team]] : []), ...(e.aiTools !== "na" ? [["AI tools and vibe coding", e.aiTools === "allowed" ? "Allowed" : "Not allowed"]] : []),
      ...(e.interCollege !== "na" ? [["Inter-college teams", e.interCollege === "yes" ? "Allowed" : "Not allowed"]] : []), ...(e.eligibility ? [["Who can participate", e.eligibility]] : [])],
      bullets: rulesList(e.rules), links: [], empty: e.rules ? "" : "No extra rules were listed." },
    faqs: { facts: [], bullets: [], faqs: e.faqs ?? [], links: [], empty: e.faqs?.length ? "" : "No FAQs yet. Ask your question below and the community can answer." },
    contact: { facts: [...(e.contactName ? [["Contact person", e.contactName]] : []), ...(mail ? [["Email", e.contactEmail, mail]] : []), ...(tel ? [["Phone", e.contactPhone, tel]] : []), ["Organiser", e.host]],
      bullets: [], links, empty: mail || tel ? "" : "No contact details were listed." },
  };
}
