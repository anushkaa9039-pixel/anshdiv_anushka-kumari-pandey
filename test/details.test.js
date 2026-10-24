import test from "node:test";
import assert from "node:assert/strict";
import { validateEvent, calendarSlot, icsFor, googleCalUrl, icsFilename, telHref } from "../src/core.js";
import { calendarMonths, sections, keyFacts, schedule, feeText, teamText, rulesList, relative, longDate, TABS } from "../src/detail.js";
import { EVENTS } from "../src/data.js";

const NOW = new Date(2026, 9, 24, 10);
const base = { title: "Chess Night", host: "Club", desc: "A relaxed evening of chess for all levels.", interests: ["gaming"], type: "meetup", hostType: "community", mode: "online",
  dateMode: "fixed", date: "2026-11-10", regDeadline: "2026-11-05", contactEmail: "a@b.org" };

test("validateEvent: key dates, prizes, eligibility, fee unit and contact are checked and cleaned", () => {
  const v = validateEvent({ ...base, regStart: "2026-10-26", feeUnit: "team", price: "300", eligibility: " Any student ", contactPhone: "+91 98765 43210", contactName: "Riya",
    timeline: [{ label: "Round 2", date: "2026-11-08" }, { label: "Idea round", date: "2026-10-30" }, { label: "", date: "" }],
    prizes: [{ place: "Winner", reward: "Rs 5,000" }, { place: "", reward: "" }] }, NOW);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.deepEqual(v.value.timeline.map((t) => t.label), ["Idea round", "Round 2"]); // sorted by date
  assert.deepEqual([v.value.prizes.length, v.value.feeUnit, v.value.eligibility, v.value.regStart], [1, "team", "Any student", "2026-10-26"]);
  const d = validateEvent(base, NOW).value; // everything new is optional
  assert.deepEqual([d.regStart, d.timeline, d.prizes, d.feeUnit, d.eligibility, d.contactPhone], [null, [], [], "person", "", ""]);
  for (const [patch, key] of [[{ regStart: "2026-11-06" }, "regStart"], [{ regStart: "nope" }, "regStart"], [{ timeline: [{ label: "x", date: "2026-11-01" }] }, "timeline"],
    [{ timeline: [{ label: "Round", date: "31-12-2026" }] }, "timeline"], [{ prizes: [{ place: "1st", reward: "" }] }, "prizes"], [{ eligibility: "x".repeat(301) }, "eligibility"],
    [{ contactPhone: "12ab" }, "contactPhone"], [{ contactPhone: "<script>" }, "contactPhone"], [{ contactName: "x".repeat(41) }, "contactName"]])
    assert.ok(validateEvent({ ...base, ...patch }, NOW).errors[key], key);
  assert.equal(validateEvent({ ...base, feeUnit: "<b>" }, NOW).value.feeUnit, "person");
  assert.equal(validateEvent({ ...base, timeline: Array.from({ length: 9 }, (_, i) => ({ label: `Round ${i}`, date: "2026-11-01" })) }, NOW).value.timeline.length, 5);
  assert.equal(validateEvent({ ...base, dateMode: "tbd", date: "", regStart: "2026-10-26" }, NOW).value.regStart, "2026-10-26");
});
test("telHref builds a tel: link from digits only", () => {
  assert.equal(telHref("+91 98765-43210"), "tel:+919876543210");
  assert.equal(telHref("(080) 2345 6789"), "tel:08023456789");
  for (const bad of ["", "12345", "javascript:alert(1)", "+1234567890123456", "98765 abc 4321", "tel:+911234567890"]) assert.equal(telHref(bad), "", bad);
});
test("calendar: timed slot, all-day deadline reminder, Google link and file name", () => {
  const ev = { id: 5, title: "Hack Night: ship it!", desc: "d", host: "H", date: "2026-10-25", time: "18:30", venue: "Hall", city: "Bhopal" };
  assert.deepEqual(calendarSlot(ev), { allDay: false, summary: ev.title, start: "20261025T183000", end: "20261025T203000" });
  const u = new URL(googleCalUrl(ev));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.deepEqual([u.searchParams.get("action"), u.searchParams.get("dates"), u.searchParams.get("location")], ["TEMPLATE", "20261025T183000/20261025T203000", "Hall, Bhopal"]);
  const tbd = { id: 6, title: "CTF", desc: "d", host: "H", date: null, regDeadline: "2026-10-31" };
  assert.equal(new URL(googleCalUrl(tbd)).searchParams.get("dates"), "20261031/20261101");
  assert.match(new URL(googleCalUrl(tbd)).searchParams.get("text"), /^Registration closes: CTF/);
  assert.ok(googleCalUrl({ ...ev, desc: "x".repeat(5000) }).length < 2000);
  assert.deepEqual([icsFilename(ev), icsFilename({ title: "!!!" })], ["hack-night-ship-it.ics", "event.ics"]);
  assert.ok(icsFor(ev, NOW).includes("DTSTART:20261025T183000"));
});
test("detail helpers: money, team, rules and dates read clearly", () => {
  assert.deepEqual([feeText({ price: 0 }), feeText({ price: 200, currency: "INR", feeUnit: "team" }), feeText({ price: 5, currency: "USD" })], ["Free", "₹200 per team", "$5 per person"]);
  assert.deepEqual([teamText({ teamMin: 2, teamMax: 4 }), teamText({ teamMax: 1 }), teamText({})], ["2 to 4 members", "Solo only", ""]);
  assert.deepEqual(rulesList("1. Be kind\n- No cheating\n\n  • Have fun "), ["Be kind", "No cheating", "Have fun"]);
  assert.deepEqual([relative("2026-10-24", NOW), relative("2026-10-27", NOW), relative("2026-10-20", NOW)], ["today", "in 3 days", "4 days ago"]);
  assert.equal(longDate("2026-10-25"), "25 Oct 2026");
});
test("event page model: key facts, schedule order and every tab have content", () => {
  const e = EVENTS.find((x) => x.id === 8), now = new Date();
  const kf = keyFacts(e, now);
  assert.deepEqual(kf.map((k) => k.label), ["Register by", "Fee", "Team size", "Attend"]);
  assert.match(kf[1].value, /per team/);
  const s = schedule(e, now);
  assert.deepEqual(s.map((x) => x.label), ["Registration opens", "Idea submission closes", "Registration closes", "Shortlist announced", "Event day"]);
  assert.ok(s.slice(0, -1).every((x, i, a) => !i || a[i - 1].date <= x.date));
  const sec = sections(e, { now, where: "Bhopal", going: 3 });
  assert.deepEqual(Object.keys(sec), TABS.map(([id]) => id));
  assert.ok(sec.rules.bullets.length === 4 && sec.prizes.prizes.length === 3 && sec.contact.facts.some(([k, , href]) => k === "Phone" && href.startsWith("tel:")));
  assert.ok(sec.contact.facts.some(([k, , href]) => k === "Email" && href === `mailto:${e.contactEmail}`));
  // an event with nothing optional filled in still explains itself instead of showing blanks
  const bare = sections(EVENTS.find((x) => x.id === 2), { now });
  assert.ok(bare.prizes.empty && bare.rules.empty && bare.faqs.empty);
  const tba = schedule(EVENTS.find((x) => x.id === 9), now).at(-1);
  assert.deepEqual([tba.label, tba.text, tba.date], ["Event day", "To be announced", null]);
});
test("month calendar: marks every date, spans months, pads weeks and stays small", () => {
  const now = new Date(2026, 9, 24, 10);
  const items = [{ label: "Registration opens", kind: "O", date: "2026-10-30" }, { label: "Registration closes", kind: "C", date: "2026-11-05" }, { label: "Event day", kind: "E", date: "2026-11-05" }, { label: "TBA", kind: "E", date: null }];
  const months = calendarMonths(items, now);
  assert.deepEqual(months.map((m) => m.title), ["October 2026", "November 2026"]);
  assert.ok(months.every((m) => m.weeks.every((w) => w.length === 7)));
  const cells = months.flatMap((m) => m.weeks.flat()).filter(Boolean);
  assert.equal(cells.filter((c) => c.day).length, 31 + 30);
  assert.deepEqual(cells.find((c) => c.iso === "2026-11-05").marks.map((x) => x.kind), ["C", "E"]);
  assert.equal(cells.find((c) => c.iso === "2026-10-24").today, true);
  assert.equal(months[0].weeks[0].findIndex(Boolean), 4); // 1 Oct 2026 is a Thursday, Sunday-first grid
  assert.deepEqual(calendarMonths([{ date: null }], now), []);
  assert.equal(calendarMonths([{ kind: "K", label: "a", date: "2026-01-01" }, { kind: "K", label: "b", date: "2027-06-01" }], now).length, 4);
  const sec = sections(EVENTS.find((x) => x.id === 8), { now: new Date() });
  assert.ok(sec.dates.months.length >= 1 && sec.dates.months.flatMap((m) => m.weeks.flat()).filter((c) => c?.marks.length).length >= 4);
});
