import test from "node:test";
import assert from "node:assert/strict";
import { analyze, interpret } from "../server/decide.js";

const reply = (answers, ok = true) => async () => ({ ok, json: async () => ({ answers }) });

test("interpret maps typed answers and ignores anything off the allow-list", () => {
  const r = interpret({ is_event: { noul: 0.9 }, topic: { choice: "arts" }, energy: { choice: "lively" }, crowd: { choice: "<script>" } });
  assert.deepEqual(r, { isEvent: true, topic: "arts", energy: 5 });
  assert.deepEqual(interpret(undefined), {});
});
test("analyze without a key falls back to local parsing", async () => {
  const r = await analyze("Hack Night tomorrow 6pm", {});
  assert.equal(r.topic, "tech");
  assert.equal(r.isEvent, true);
});
test("analyze uses model answers and sends the key only in the header", async () => {
  let seen;
  const f = async (url, init) => { seen = init; return reply({ is_event: { noul: 0.1 }, crowd: { choice: "large" } })(); };
  const r = await analyze("Win a free phone, click here", { key: "k", fetchImpl: f });
  assert.equal(r.isEvent, false);
  assert.equal(r.crowd, 5);
  assert.equal(seen.headers.Authorization, "Bearer k");
  assert.ok(!seen.body.includes('"k"'));
});
test("analyze survives upstream errors and network failures", async () => {
  assert.equal((await analyze("Chess night", { key: "k", fetchImpl: reply({}, false) })).isEvent, true);
  assert.equal((await analyze("Chess night", { key: "k", fetchImpl: async () => { throw new Error("down"); } })).isEvent, true);
});
