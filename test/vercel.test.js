import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import handler, { resolvePath } from "../server/vercel.js";
import { clientIp, HEADERS } from "../server/app.js";

test("vercel.json builds public/, bundles the api functions, and sets the same security headers as the Node server", () => {
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(v.outputDirectory, "public");
  assert.equal(v.framework, null);
  assert.ok(v.functions["api/**/*.js"]);
  const h = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]));
  assert.equal(h["Content-Security-Policy"], HEADERS["Content-Security-Policy"]);
  for (const k of ["X-Content-Type-Options", "Strict-Transport-Security", "Permissions-Policy", "X-Frame-Options"]) assert.ok(h[k], k);
});
test("every API route has a Vercel function file that re-exports the shared handler", () => {
  for (const f of ["api/health.js", "api/analyze.js", "api/events/index.js", "api/events/[id]/doubts.js", "api/poster/[id].js"]) {
    assert.match(readFileSync(f, "utf8"), /server\/vercel\.js/, f);
  }
  assert.equal(existsSync("Dockerfile"), false, "a root Dockerfile makes Vercel build a container");
});
test("every file the build copies exists", () => {
  const src = readFileSync("scripts/build.js", "utf8"), list = /for \(const f of \[(.*?)\]/.exec(src)[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
  for (const f of list) assert.ok(existsSync(f), f);
});
test("resolvePath restores the original API path from the rewrite", () => {
  assert.equal(resolvePath("/api/index.js?__p=events/123/doubts"), "/api/events/123/doubts");
  assert.equal(resolvePath("/api/events/[id]/doubts?id=77"), "/api/events/77/doubts");
  assert.equal(resolvePath("/api/events/55/doubts", { id: "55" }), "/api/events/55/doubts");
  assert.equal(resolvePath("/api/index.js?__p=health"), "/api/health");
  assert.equal(resolvePath("/api/events"), "/api/events");
});
test("clientIp trusts forwarded headers only behind a proxy", () => {
  const req = { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" }, socket: { remoteAddress: "10.0.0.1" } };
  assert.equal(clientIp(req, {}), "10.0.0.1");
  assert.equal(clientIp(req, { VERCEL: "1" }), "9.9.9.9");
});
test("serverless handler serves health, 404s unknown paths, and rejects bad methods", async (t) => {
  const s = http.createServer(handler); await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(() => { s.closeAllConnections?.(); s.close(); });
  const base = `http://127.0.0.1:${s.address().port}`;
  const h = await fetch(`${base}/api/health`);
  assert.equal(h.status, 200);
  assert.equal((await h.json()).ok, true);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/health`, { method: "POST" })).status, 405);
});
