import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/app.js";

async function start(opts = {}) {
  const calls = [];
  const s = createApp({ analyzeFn: async (t) => { calls.push(t); return { title: t, isEvent: true, source: "model" }; }, ...opts });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, calls, base: `http://127.0.0.1:${s.address().port}` };
}
const done = (s) => () => { s.closeAllConnections?.(); s.close(); };
const post = (base, body, headers = { "Content-Type": "application/json" }) => fetch(`${base}/api/analyze`, { method: "POST", headers, body });
const rawStatus = (base, p) => new Promise((ok) => { const u = new URL(base); http.get({ host: u.hostname, port: u.port, path: p }, (r) => { r.resume(); ok(r.statusCode); }); });

test("serves allow-listed files with security headers", async (t) => {
  const { s, base } = await start(); t.after(done(s));
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  for (const h of ["content-security-policy", "x-content-type-options", "permissions-policy", "cross-origin-opener-policy"]) assert.ok(r.headers.get(h), h);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal((await fetch(base + "/src/core.js")).status, 200);
  assert.equal((await fetch(base + "/src/detail.js")).status, 200);
});
test("never serves files outside the allow-list, including traversal attempts", async (t) => {
  const { s, base } = await start(); t.after(done(s));
  for (const p of ["/.env", "/server/app.js", "/package.json", "/src/%2e%2e/.env", "/src/../.env", "/..%2f.env"]) assert.equal(await rawStatus(base, p), 404, p);
});
test("rejects wrong methods and content types", async (t) => {
  const { s, base } = await start(); t.after(done(s));
  assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  assert.equal((await fetch(base + "/api/analyze")).status, 405);
  assert.equal((await post(base, "{}", { "Content-Type": "text/plain" })).status, 415);
});
test("validates the request body", async (t) => {
  const { s, base } = await start(); t.after(done(s));
  for (const body of ["not json", "{}", '{"text":5}', '{"text":"   "}', JSON.stringify({ text: "x".repeat(1001) })]) assert.equal((await post(base, body)).status, 400, body.slice(0, 20));
  assert.equal((await post(base, JSON.stringify({ text: "x".repeat(3000) }))).status, 413);
});
test("caches model results and hides internal fields from the browser", async (t) => {
  const { s, calls, base } = await start(); t.after(done(s));
  const a = await (await post(base, '{"text":"Hack Night"}')).json();
  await post(base, '{"text":"Hack Night"}');
  assert.equal(calls.length, 1);
  assert.equal(a.isEvent, true);
  assert.equal("source" in a, false);
});
test("does not cache local fallbacks", async (t) => {
  const calls = [];
  const { s, base } = await start({ analyzeFn: async (x) => { calls.push(x); return { isEvent: true, source: "local" }; } }); t.after(done(s));
  await post(base, '{"text":"a"}'); await post(base, '{"text":"a"}');
  assert.equal(calls.length, 2);
});
test("rate limits repeated callers", async (t) => {
  const { s, base } = await start({ limit: { max: 2 } }); t.after(done(s));
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await post(base, `{"text":"t${i}"}`)).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
});
test("returns a generic 500 when the analyzer throws", async (t) => {
  const { s, base } = await start({ analyzeFn: async () => { throw new Error("secret detail"); } }); t.after(done(s));
  const r = await post(base, '{"text":"x"}');
  assert.equal(r.status, 500);
  assert.ok(!(await r.text()).includes("secret"));
});

test("serves the thirteen demo posters as images and nothing else in /posters", async (t) => {
  const { s, base } = await start(); t.after(done(s));
  for (let i = 1; i <= 13; i++) { const r = await fetch(`${base}/posters/${i}.svg`); assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /image\/svg\+xml/); }
  assert.equal((await fetch(`${base}/posters/14.svg`)).status, 404);
  assert.equal(await rawStatus(base, "/posters/..%2fpackage.json"), 404);
});

import { istNow } from "../server/app.js";
import { createEventStore } from "../server/events.js";
import { createMemoryKv } from "../server/kv.js";
import { dateIn } from "../src/core.js";

const JSONH = { "Content-Type": "application/json" };
const evBody = (o = {}) => ({ title: "Robotics Meetup", host: "Club", desc: "A relaxed evening of robotics for all levels.", interests: ["iot"], type: "meetup", hostType: "community", mode: "online",
  dateMode: "fixed", date: dateIn(4, istNow()), contactEmail: "a@b.co", ...o });
const D1 = "a".repeat(32), D2 = "b".repeat(32);

test("istNow shows the Indian date even when the server clock is UTC", () => {
  assert.equal(dateIn(0, istNow(new Date("2026-11-06T20:00:00Z"))), "2026-11-07");
  assert.equal(dateIn(0, istNow(new Date("2026-11-06T10:00:00Z"))), "2026-11-06");
});
test("audience network: opt in, count anonymously, opt out", async (t) => {
  const { s, base } = await start({ store: createEventStore(createMemoryKv()), limit: { writeMax: 100 } }); t.after(done(s));
  const put = (b, m = "PUT") => fetch(`${base}/api/people`, { method: m, headers: JSONH, body: JSON.stringify(b) });
  assert.equal((await put({ id: "nope", interests: ["ai"] })).status, 400);
  assert.equal((await put({ id: D1, interests: [] })).status, 400);
  assert.equal((await put({ id: D1, interests: ["ai"], lat: 23.26, lng: 77.41, name: "Riya" })).status, 200);
  assert.equal((await put({ id: D2, interests: [], past: { ai: 2 }, lat: 23.27, lng: 77.4 })).status, 200);
  const aud = (b) => fetch(`${base}/api/audience`, { method: "POST", headers: JSONH, body: JSON.stringify(b) });
  const r = await aud({ interests: ["ai"], lat: 23.26, lng: 77.41, radiusKm: 25 });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual([j.count, j.interested, j.returning, j.total], [2, 1, 1, 2]);
  assert.equal(JSON.stringify(j).includes(D1), false); // counts only, never identities
  assert.equal((await aud({ interests: [] })).status, 400);
  assert.equal((await aud({ interests: ["ai"], radiusKm: -5 })).status, 400);
  assert.equal((await aud({ interests: ["ai"], lat: "x" })).status, 400);
  assert.equal((await put({ id: D1 }, "DELETE")).status, 200);
  assert.equal((await (await aud({ interests: ["ai"] })).json()).total, 1);
  assert.equal((await fetch(`${base}/api/audience`)).status, 405);
});
test("event edit/delete need the management key; admin key overrides; rsvp counts are shared", async (t) => {
  const { s, base } = await start({ store: createEventStore(createMemoryKv()), adminKey: "root-secret", limit: { writeMax: 100 } }); t.after(done(s));
  const pub = await fetch(`${base}/api/events`, { method: "POST", headers: JSONH, body: JSON.stringify({ event: evBody() }) });
  assert.equal(pub.status, 201);
  const { event, manageToken } = await pub.json();
  assert.match(manageToken, /^[a-f0-9]{32}$/);
  const list = await (await fetch(`${base}/api/events`)).json();
  assert.equal(JSON.stringify(list).includes(manageToken), false);
  assert.equal("mh" in list[0], false);
  const put = (headers, ev = evBody({ title: "Robotics Meetup 2" })) => fetch(`${base}/api/events/${event.id}`, { method: "PUT", headers: { ...JSONH, ...headers }, body: JSON.stringify({ event: ev }) });
  assert.equal((await put({})).status, 403);
  assert.equal((await put({ "x-manage-token": "nope" })).status, 403);
  assert.equal((await put({ "x-manage-token": manageToken })).status, 200);
  assert.equal((await put({ "x-manage-token": manageToken }, evBody({ title: "x" }))).status, 400);
  assert.equal((await put({ "x-admin-key": "wrong" })).status, 403);
  assert.equal((await put({ "x-admin-key": "root-secret" }, evBody({ title: "Robotics Meetup 3" }))).status, 200);
  assert.equal((await (await fetch(`${base}/api/events`)).json())[0].title, "Robotics Meetup 3");
  const rsvp = (device, going) => fetch(`${base}/api/events/${event.id}/rsvp`, { method: "POST", headers: JSONH, body: JSON.stringify({ device, going }) });
  assert.equal((await (await rsvp(D1, true)).json()).joined, 1);
  assert.equal((await (await rsvp(D2, true)).json()).joined, 2);
  assert.equal((await rsvp("bad", true)).status, 400);
  assert.equal((await (await fetch(`${base}/api/events/999/rsvp`, { method: "POST", headers: JSONH, body: JSON.stringify({ device: D1, going: true }) })).status), 404);
  const del = (headers) => fetch(`${base}/api/events/${event.id}`, { method: "DELETE", headers });
  assert.equal((await del({})).status, 403);
  assert.equal((await del({ "x-manage-token": manageToken })).status, 200);
  assert.equal((await del({ "x-manage-token": manageToken })).status, 404);
  assert.equal((await (await fetch(`${base}/api/events`)).json()).length, 0);
  assert.equal((await fetch(`${base}/api/events/${event.id}`)).status, 405);
});

test("built-in Mumbai events: only an admin can edit one, and the edit then replaces it for everyone", async (t) => {
  const { s, base } = await start({ store: createEventStore(createMemoryKv()), adminKey: "root-secret", limit: { writeMax: 100 } }); t.after(done(s));
  const body = JSON.stringify({ event: evBody({ title: "DevFest Mumbai 2026", contactEmail: "" }) });
  const put = (id, headers) => fetch(`${base}/api/events/${id}`, { method: "PUT", headers: { ...JSONH, ...headers }, body });
  assert.equal((await put(9009, {})).status, 404); // no key: nothing happens
  const withMail = JSON.stringify({ event: evBody() });
  assert.equal((await fetch(`${base}/api/events/5`, { method: "PUT", headers: { ...JSONH, "x-admin-key": "root-secret" }, body: withMail })).status, 404); // admin cannot invent ids outside the built-in range
  const r = await put(9009, { "x-admin-key": "root-secret" });
  assert.equal(r.status, 200);
  const list = await (await fetch(`${base}/api/events`)).json();
  assert.deepEqual(list.filter((e) => e.id === 9009).map((e) => e.title), ["DevFest Mumbai 2026"]);
  assert.equal((await put(9009, { "x-admin-key": "root-secret" })).status, 200); // a second edit updates, never duplicates
  assert.equal((await (await fetch(`${base}/api/events`)).json()).filter((e) => e.id === 9009).length, 1);
});
