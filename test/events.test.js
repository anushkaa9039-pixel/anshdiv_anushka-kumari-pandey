import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEventStore, parsePoster } from "../server/events.js";
import { createApp } from "../server/app.js";
import { dateIn } from "../src/core.js";

const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64");
const mk = (extra = {}) => ({ title: "Chess Night", host: "Club", desc: "A relaxed evening of chess for all levels.", interests: ["gaming"], type: "meetup", hostType: "community", mode: "online", dateMode: "fixed", date: dateIn(3), time: "18:00", contactEmail: "club@example.org", ...extra });
const tmp = async () => path.join(await mkdtemp(path.join(tmpdir(), "nk-")), "events.json");

test("store persists across restarts and drops past events (by date, or deadline when date is TBA)", async () => {
  const file = await tmp(), now = new Date(2026, 9, 24);
  await createEventStore(file).add(mk({ date: "2026-10-26" }), null, now);
  await createEventStore(file).add(mk({ title: "CTF Finals", dateMode: "tbd", date: "", regDeadline: "2026-10-30" }), null, now);
  const b = createEventStore(file);
  assert.equal((await b.all(new Date(2026, 9, 25))).length, 2);
  assert.deepEqual((await b.all(new Date(2026, 9, 27))).map((e) => e.title), ["CTF Finals"]);
  assert.equal((await b.all(new Date(2026, 10, 1))).length, 0);
  assert.equal((await b.add(mk({ title: "x" }))).ok, false);
});
test("store keeps only real posters and caps total events", async () => {
  const s = createEventStore(await tmp(), { max: 2 });
  assert.equal((await s.add(mk(), "data:image/png;base64,PHN2Zz4=")).ok, false);
  const r = await s.add(mk(), PNG);
  assert.ok(r.ok && r.event.poster === `/api/poster/${r.event.id}`);
  assert.equal((await s.poster(r.event.id)).mime, "image/png");
  await s.add(mk()); await s.add(mk());
  assert.equal((await s.all()).length, 2);
  assert.equal(await s.poster(r.event.id), null);
});
test("parsePoster rejects svg, oversize and mismatched types", () => {
  assert.equal(parsePoster("data:image/svg+xml;base64,AAAA"), null);
  assert.equal(parsePoster(PNG.replace("png", "jpeg")), null);
  assert.equal(parsePoster(`data:image/png;base64,${"A".repeat(2_000_001)}`), null);
  assert.ok(parsePoster(PNG));
});
test("doubt threads: questions, replies, validation and persistence", async () => {
  const file = await tmp(), s = createEventStore(file);
  const q = await s.addDoubt("7", { name: "  Asha ", text: "Is vibe   coding allowed?" });
  assert.ok(q.ok && q.item.id === 1 && q.item.name === "Asha" && q.item.text === "Is vibe coding allowed?");
  const r = await s.addDoubt("7", { name: "", text: "Yes, check the rules.", replyTo: 1 });
  assert.ok(r.ok && r.item.replyTo === 1 && r.item.name === "Guest");
  assert.equal((await s.addDoubt("7", { text: "reply to reply", replyTo: 2 })).ok, false);
  assert.equal((await s.addDoubt("7", { text: "x", replyTo: 99 })).ok, false);
  assert.equal((await s.addDoubt("7", { text: "   " })).ok, false);
  assert.equal((await s.addDoubt("7", { text: "y".repeat(301) })).ok, false);
  assert.equal((await createEventStore(file).doubts("7")).length, 2);
  assert.deepEqual(await s.doubts("999"), []);
});
test("events API: publish, list, poster, doubts, and rejections", async (t) => {
  const store = createEventStore(await tmp());
  const s = createApp({ store, analyzeFn: async (x) => ({ isEvent: !x.includes("Win a free phone"), source: "local" }) });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(() => { s.closeAllConnections?.(); s.close(); });
  const base = `http://127.0.0.1:${s.address().port}`;
  const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const ok = await post("/api/events", { event: mk(), poster: PNG });
  assert.equal(ok.status, 201);
  const { event } = await ok.json();
  assert.equal((await (await fetch(`${base}/api/events`)).json())[0].title, "Chess Night");
  assert.equal((await fetch(base + event.poster)).headers.get("content-type"), "image/png");
  assert.equal((await post("/api/events", { event: mk({ title: "x" }) })).status, 400);
  assert.equal((await post("/api/events", { event: mk(), poster: "data:image/svg+xml;base64,AAAA" })).status, 400);
  assert.equal((await post("/api/events", { event: mk({ title: "Win a free phone now" }) })).status, 422);
  assert.equal((await post("/api/events", {})).status, 400);
  assert.equal((await fetch(`${base}/api/poster/999`)).status, 404);

  const d = await post("/api/events/7/doubts", { name: "Asha", text: "Is food provided?" });
  assert.equal(d.status, 201);
  assert.equal((await post("/api/events/7/doubts", { text: "Yes", replyTo: 1 })).status, 201);
  assert.equal((await post("/api/events/7/doubts", { text: "" })).status, 400);
  assert.equal((await post("/api/events/7/doubts", { text: "hi", replyTo: 42 })).status, 400);
  assert.equal((await (await fetch(`${base}/api/events/7/doubts`)).json()).length, 2);
  assert.equal((await fetch(`${base}/api/events/abc/doubts`)).status, 404);
});
test("store keeps the new detail fields and a full publish round-trip returns them", async () => {
  const detail = { regStart: dateIn(1), timeline: [{ label: "Idea round", date: dateIn(4) }], prizes: [{ place: "Winner", reward: "Rs 5,000" }], feeUnit: "team", price: "250",
    eligibility: "Any student", contactPhone: "+91 98765 43210", contactName: "Riya" };
  const s = createEventStore(await tmp());
  const r = await s.add(mk(detail));
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual([r.event.timeline.length, r.event.prizes[0].place, r.event.feeUnit, r.event.contactPhone], [1, "Winner", "team", "+91 98765 43210"]);
  const app = createApp({ analyzeFn: async () => ({ isEvent: true, source: "model" }), store: createEventStore(await tmp()) });
  await new Promise((ok) => app.listen(0, "127.0.0.1", ok));
  try {
    const base = `http://127.0.0.1:${app.address().port}`, headers = { "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/events`, { method: "POST", headers, body: JSON.stringify({ event: mk({ ...detail, contactPhone: "call me" }) }) })).status, 400);
    const ok = await fetch(`${base}/api/events`, { method: "POST", headers, body: JSON.stringify({ event: mk(detail) }) });
    assert.equal(ok.status, 201);
    assert.equal((await (await fetch(`${base}/api/events`)).json())[0].prizes[0].reward, "Rs 5,000");
  } finally { app.closeAllConnections?.(); app.close(); }
});
