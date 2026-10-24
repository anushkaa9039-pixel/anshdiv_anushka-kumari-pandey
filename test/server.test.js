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
