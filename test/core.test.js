import test from "node:test";
import assert from "node:assert/strict";
import { haversine, parseMapLink, safeLink, validatePoster, sniffImage, isoDate, dateIn, daysUntil, formatDate, deadlineInfo, formatPrice, formatKm,
  affinity, matchScore, suggestReason, rank, validateEvent, makePeople, reach, streak, parseEventText, shareKit, inviteLink, icsFor, safePoster,
  cleanName, greeting, hueOf, EVENT_TYPES, HOST_TYPES, MODES } from "../src/core.js";
import { EVENTS } from "../src/data.js";

const NOW = new Date(2026, 9, 24, 10);
const BPL = { lat: 23.2599, lng: 77.4126 };
const online = { title: "Chess Night", host: "Club", desc: "A relaxed evening of chess for all levels.", interests: ["gaming"], type: "meetup", hostType: "community", mode: "online", dateMode: "fixed", date: "2026-10-30", time: "18:00", contactEmail: "club@example.org" };
const inPerson = { ...online, mode: "offline", city: "Bhopal", country: "India", lat: 23.2, lng: 77.4 };

test("haversine: zero for same point, about 111 km per degree", () => {
  assert.equal(haversine(BPL, BPL), 0);
  assert.ok(Math.abs(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.2) < 0.3);
});
test("links: map links, channel links and posters are strictly validated", () => {
  assert.deepEqual(parseMapLink("https://www.google.com/maps/place/X/@23.2166,77.4079,17z"), { lat: 23.2166, lng: 77.4079 });
  assert.deepEqual(parseMapLink("https://www.google.co.in/maps?q=23.25,77.41"), { lat: 23.25, lng: 77.41 });
  for (const bad of ["https://evil.com/maps/@23.2,77.4,1z", "http://www.google.com/maps/@23.2,77.4,1z", "https://www.google.com/maps/@95.0,77.4,1z", "nope"]) assert.equal(parseMapLink(bad), null);
  assert.equal(safeLink("whatsapp", "https://chat.whatsapp.com/Abc?x=1"), "https://chat.whatsapp.com/Abc");
  assert.equal(safeLink("linkedin", "https://www.linkedin.com/company/x"), "https://www.linkedin.com/company/x");
  assert.equal(safeLink("website", "https://club.org/register"), "https://club.org/register");
  assert.equal(safeLink("instagram", ""), "");
  for (const [k, v] of [["website", "javascript:alert(1)"], ["website", "https://u:p@site.com"], ["whatsapp", "http://chat.whatsapp.com/x"], ["instagram", "https://evil.com/x"]]) assert.equal(safeLink(k, v), null, v);
  assert.equal(validatePoster({ type: "image/png", size: 1000 }), "");
  assert.ok(validatePoster({ type: "image/svg+xml", size: 10 }) && validatePoster({ type: "image/jpeg", size: 2e6 }) && validatePoster(undefined));
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(sniffImage(Uint8Array.from([0x3c, 0x73, 0x76, 0x67])), "");
  assert.equal(safePoster("/posters/3.svg"), "/posters/3.svg");
  assert.equal(safePoster("/api/poster/123"), "/api/poster/123");
  for (const bad of ["javascript:alert(1)", "https://evil.com/x.png", "data:image/svg+xml;base64,AAAA", "/posters/../x", null]) assert.equal(safePoster(bad), null);
});
test("dates and formatting", () => {
  assert.ok(isoDate("2026-02-28") && !isoDate("2026-02-30") && !isoDate("26-1-1"));
  assert.equal(dateIn(7, new Date(2026, 9, 30)), "2026-11-06");
  assert.equal(daysUntil("2026-10-23", NOW), -1);
  assert.deepEqual([formatDate("2026-10-24", NOW), formatDate("2026-10-25", NOW), formatDate("2026-10-30", NOW)], ["Today", "Tomorrow", "Fri, 30 Oct"]);
  assert.equal(deadlineInfo({ regDeadline: "2026-10-26" }, NOW).state, "soon");
  assert.equal(deadlineInfo({ regDeadline: "2026-11-20" }, NOW).state, "open");
  assert.equal(deadlineInfo({ regDeadline: "2026-10-20" }, NOW).text, "Registration closed");
  assert.equal(deadlineInfo({}, NOW).state, "none");
  assert.equal(formatPrice(0, "INR"), "Free");
  assert.match(formatPrice(499, "INR"), /499/);
  assert.equal(formatKm(null), "");
  assert.equal(formatKm(12.3), "12.3 km");
  assert.match(formatKm(1420.4), /1,420 km/);
});
test("suggestions use interests plus past participation", () => {
  const e = { interests: ["tech", "ai"], level: "student", km: 2, type: "hackathon", host: "GDG Bhopal" };
  assert.equal(matchScore(e, null), null);
  assert.equal(matchScore({ ...e, interests: ["software", "ai"] }, { interests: ["software", "ai"], level: "student" }), 100);
  assert.equal(matchScore({ ...e, interests: ["music"] }, { interests: ["art"], level: "pro" }), 10);
  const aff = affinity([{ interests: ["music"], type: "meetup", host: "Kahani" }, { interests: ["music", "art"], type: "meetup", host: "Kahani" }]);
  assert.deepEqual([aff.interests.music, aff.types.meetup, aff.hosts.kahani], [2, 2, 2]);
  const ev = { interests: ["music"], level: "all", km: 30, type: "meetup", host: "Kahani", mode: "offline" };
  assert.equal(matchScore(ev, { interests: ["art"], level: "pro" }, aff), 0 + 20 + 0 + 5 + 5 + 5);
  assert.ok(matchScore(ev, null, aff) > 0);
  assert.equal(suggestReason(ev, { interests: ["music"] }, aff), "you like Music and you joined Kahani before");
  assert.equal(suggestReason({ ...ev, host: "Other", type: "summit" }, null, aff), "you joined Music events before");
  assert.equal(suggestReason(ev, null, null), "");
});
test("rank: nearby first, online has no distance, filters and token search work", () => {
  const r = rank(EVENTS, { origin: BPL, now: NOW });
  assert.ok(r.length >= 12);
  const firstFar = r.findIndex((e) => !e.nearby);
  assert.ok(r.slice(0, firstFar).every((e) => e.nearby) && r.slice(firstFar).every((e) => !e.nearby));
  assert.ok(r.filter((e) => e.mode === "online").every((e) => e.km === null && !e.nearby));
  assert.ok(rank(EVENTS, { origin: null, now: NOW }).every((e) => e.km === null && !e.nearby));
  assert.ok(rank(EVENTS, { mode: "online", now: NOW }).every((e) => e.mode !== "offline"));
  assert.ok(rank(EVENTS, { mode: "offline", now: NOW }).every((e) => e.mode !== "online"));
  assert.ok(rank(EVENTS, { type: "hackathon", now: NOW }).every((e) => e.type === "hackathon"));
  assert.ok(rank(EVENTS, { interest: "cyber", now: NOW }).every((e) => e.interests.includes("cyber")));
  assert.ok(rank(EVENTS, { price: "free", now: NOW }).every((e) => e.price === 0));
  assert.ok(rank(EVENTS, { when: "week", now: NOW }).every((e) => (e.day ?? e.deadlineDays) <= 7));
  assert.ok(rank(EVENTS, { when: "closing", now: NOW }).every((e) => e.deadlineDays <= 7));
  assert.deepEqual(rank(EVENTS, { query: "cyber delhi", now: NOW }).map((e) => e.title), ["Delhi Cyber Workshop"]);
  assert.ok(rank(EVENTS, { query: "singapore", now: NOW }).length === 1 && rank(EVENTS, { query: "zzzz", now: NOW }).length === 0);
  assert.ok(rank(EVENTS, { query: "blockchain", now: NOW }).length >= 2);
});
test("rank keeps events with an unannounced date, drops past ones, boosts followed hosts and history", () => {
  assert.ok(rank(EVENTS, { now: NOW }).some((e) => e.date === null && e.deadlineDays >= 0));
  assert.equal(rank(EVENTS, { now: new Date(2027, 5, 1) }).length, 0);
  const profile = { interests: ["music"], level: "pro" };
  const base = rank(EVENTS, { origin: BPL, profile, now: NOW }).find((e) => e.host === "GDG Bhopal");
  const boost = rank(EVENTS, { origin: BPL, profile, following: ["gdg bhopal"], now: NOW }).find((e) => e.host === "GDG Bhopal");
  assert.equal(boost.match, base.match + 15);
  const hist = rank(EVENTS, { origin: BPL, profile, history: [{ interests: ["software"], type: "hackathon", host: "GDG Bhopal" }], now: NOW }).find((e) => e.host === "GDG Bhopal");
  assert.ok(hist.match > base.match);
});
test("validateEvent: minimal online event passes; requirements depend on mode and date status", () => {
  assert.ok(validateEvent(online, NOW).ok);
  const off = validateEvent({ ...online, mode: "offline" }, NOW);
  for (const k of ["loc", "city", "country"]) assert.ok(off.errors[k], k);
  assert.ok(validateEvent(inPerson, NOW).ok);
  assert.ok(validateEvent({ ...inPerson, mode: "hybrid" }, NOW).ok);
  assert.equal(validateEvent({ ...online, mode: "x" }, NOW).errors.mode, "Pick how people attend.");
  const tbd = { ...online, dateMode: "tbd", date: "" };
  assert.ok(validateEvent(tbd, NOW).errors.regDeadline);
  const ok = validateEvent({ ...tbd, regDeadline: "2026-11-05" }, NOW);
  assert.ok(ok.ok && ok.value.date === null && ok.value.time === null && ok.value.regDeadline === "2026-11-05");
  assert.ok(validateEvent({ ...online, date: "2026-10-20" }, NOW).errors.date);
  assert.ok(validateEvent({ ...online, date: "" }, NOW).errors.date);
  assert.ok(validateEvent({ ...online, regDeadline: "2026-11-15" }, NOW).errors.regDeadline);
  assert.ok(validateEvent({ ...online, regDeadline: "2026-10-01" }, NOW).errors.regDeadline);
});
test("validateEvent: fees, benefits, team, rules, contact, FAQs and links", () => {
  const v = validateEvent({ ...online, price: "499", currency: "USD", benefits: ["prizes", "bogus"], prizeNote: "Rs 50k", teamMin: "2", teamMax: "4", aiTools: "allowed", interCollege: "no", rules: "Be kind.",
    faqs: [{ q: "Is it free?", a: "Yes it is." }, { q: "", a: "" }], whatsapp: "https://wa.me/123", linkedin: "" }, NOW);
  assert.ok(v.ok);
  assert.deepEqual([v.value.price, v.value.currency, v.value.benefits, v.value.teamMin, v.value.teamMax, v.value.aiTools, v.value.interCollege, v.value.faqs.length], [499, "USD", ["prizes"], 2, 4, "allowed", "no", 1]);
  assert.equal(validateEvent(online, NOW).value.price, 0);
  assert.equal(validateEvent(online, NOW).value.aiTools, "na");
  for (const [patch, key] of [[{ price: "-5" }, "price"], [{ price: "abc" }, "price"], [{ teamMin: "5", teamMax: "2" }, "team"], [{ teamMin: "0" }, "team"], [{ teamMax: "2.5" }, "team"],
    [{ rules: "x".repeat(401) }, "rules"], [{ contactEmail: "nope" }, "contactEmail"], [{ contactEmail: "" }, "contactEmail"], [{ faqs: [{ q: "Hi", a: "yes ok" }] }, "faqs"],
    [{ linkedin: "https://evil.com/x" }, "linkedin"], [{ website: "javascript:alert(1)" }, "website"], [{ type: "party" }, "type"], [{ hostType: "" }, "hostType"], [{ interests: [] }, "interests"], [{ prizeNote: "x".repeat(81) }, "prizeNote"]])
    assert.ok(validateEvent({ ...online, ...patch }, NOW).errors[key], key);
});
test("every sample event is itself valid and covers the brief", () => {
  for (const e of EVENTS) {
    const r = validateEvent({ ...e, dateMode: e.date ? "fixed" : "tbd" });
    assert.ok(r.ok, `${e.title}: ${JSON.stringify(r.errors)}`);
    assert.equal(safePoster(e.poster), e.poster);
  }
  assert.deepEqual([...new Set(EVENTS.map((e) => e.type))].sort(), [...EVENT_TYPES].sort());
  assert.deepEqual([...new Set(EVENTS.map((e) => e.hostType))].sort(), [...HOST_TYPES].sort());
  assert.deepEqual([...new Set(EVENTS.map((e) => e.mode))].sort(), [...MODES].sort());
  assert.ok(EVENTS.some((e) => e.country !== "India" && e.country) && EVENTS.some((e) => e.interests.includes("cyber")) && EVENTS.some((e) => e.interests.includes("blockchain")));
});
test("audience finder: deterministic, mode-aware, level and interest aware", () => {
  const a = makePeople(240), b = makePeople(240);
  assert.deepEqual(a[5], b[5]);
  const ev = { ...BPL, interests: ["software"], level: "all" };
  const everywhere = reach(ev, a, Infinity), near = reach(ev, a, 25);
  assert.ok(everywhere.count > near.count && near.count > 0);
  assert.ok(reach({ ...ev, level: "pro" }, a, Infinity).count < everywhere.count);
  assert.equal(reach({ ...ev, interests: [] }, a, Infinity).count, 0);
});
test("misc: streak, names, greeting, hue, text parsing, share, invite, calendar", () => {
  assert.equal(streak([5, 6, 7, 3]), 3);
  assert.equal(cleanName("  anushka "), "Anushka");
  for (const bad of ["", "<b>x</b>", "a1", "x".repeat(31)]) assert.equal(cleanName(bad), "");
  assert.deepEqual([3, 9, 14, 20].map(greeting), ["Hello", "Good morning", "Good afternoon", "Good evening"]);
  assert.ok(hueOf("Chess") >= 0 && hueOf("Chess") < 360);
  const p = parseEventText("*Hack Night* \ud83d\ude80\nTomorrow, 6 PM\nOnline on Zoom");
  assert.deepEqual([p.title, p.time, p.day, p.type, p.domain, p.mode], ["Hack Night", "18:00", 1, "hackathon", "software", "online"]);
  assert.equal(parseEventText("CTF cyber contest").domain, "cyber");
  assert.equal(parseEventText("Web3 meetup").domain, "blockchain");
  assert.deepEqual([parseEventText("Chai meetup").day, parseEventText("Poetry slam tonight 7:30pm").time], [null, "19:30"]);
  const k = shareKit({ title: "Chess Night", host: "Club", time: null, interests: ["gaming"] }, "Date TBA");
  assert.deepEqual(Object.keys(k), ["WhatsApp", "LinkedIn", "Instagram"]);
  assert.ok(Object.values(k).every((m) => m.includes("Chess Night")) && !k.WhatsApp.includes("null"));
  assert.ok(inviteLink({ title: "A & B", time: "18:00" }, "Today").includes(encodeURIComponent("A & B")));
  const ics = icsFor({ id: 9, title: "Hack, Learn; Repeat", desc: "L1\nL2", host: "Club", date: "2026-10-25", time: "18:30", lat: 23.2, lng: 77.4, city: "Bhopal" }, NOW);
  assert.ok(ics.includes("DTSTART:20261025T183000") && ics.includes("SUMMARY:Hack\\, Learn\\; Repeat") && ics.includes("L1\\nL2") && ics.includes("GEO:23.2;77.4"));
  const tbd = icsFor({ id: 9, title: "CTF", desc: "d", host: "H", date: null, regDeadline: "2026-10-31" }, NOW);
  assert.ok(tbd.includes("DTSTART;VALUE=DATE:20261031") && tbd.includes("DTEND;VALUE=DATE:20261101") && tbd.includes("Registration closes: CTF") && tbd.includes("LOCATION:Online"));
});
test("parseEventText strips mode and time words from the title", () => {
  assert.equal(parseEventText("Hack the Cloud online on Zoom tomorrow 6pm").title, "Hack the Cloud");
});
