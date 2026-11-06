import test from "node:test";
import assert from "node:assert/strict";
import { cleanPerson, summarize, createPeopleStore } from "../server/people.js";
import { createMemoryKv } from "../server/kv.js";

const ID = (n) => String(n).padStart(32, "a");
const BHOPAL = { lat: 23.26, lng: 77.41 }, INDORE = { lat: 22.72, lng: 75.86 };
const person = (o) => ({ interests: [], past: {}, level: "student", ...BHOPAL, at: 1, ...o });

test("cleanPerson keeps only known interests, rounds the location and drops anything personal", () => {
  const r = cleanPerson({ interests: ["ai", "nope", "web"], past: { ai: 3.9, cyber: 0, zzz: 5 }, level: "pro", lat: 23.2599, lng: 77.4126, name: "Riya", email: "r@x.com" }, 5);
  assert.deepEqual(r, { interests: ["ai", "web"], past: { ai: 3 }, level: "pro", lat: 23.26, lng: 77.41, at: 5 });
  assert.equal("name" in r || "email" in r, false);
  assert.equal(cleanPerson({ interests: [], past: {} }), null);
  assert.equal(cleanPerson("x"), null);
  assert.equal(cleanPerson({ interests: ["ai"], lat: 999, lng: 1 }).lat, null);
});

test("audience matches current interests OR domains of events joined before, within the radius", () => {
  const map = {
    a: person({ interests: ["ai"] }),                         // likes it now
    b: person({ past: { ai: 2 } }),                           // joined AI events before, no stated interest
    c: person({ interests: ["music"] }),                      // unrelated
    d: person({ interests: ["ai"], ...INDORE }),              // right domain, ~190 km away
    e: person({ interests: ["ai"], lat: null, lng: null }),   // no location
    f: person({ interests: ["ai"], level: "pro" }),
  };
  const near = summarize(map, { interests: ["ai"], ...BHOPAL, radiusKm: 25 });
  assert.equal(near.count, 3);                 // a, b, f
  assert.equal(near.interested, 2);            // a, f
  assert.equal(near.returning, 1);             // b
  assert.equal(near.all, 5);                   // plus d and e anywhere
  assert.equal(summarize(map, { interests: ["ai"], ...BHOPAL, radiusKm: 400 }).count, 4);
  assert.equal(summarize(map, { interests: ["ai"], radiusKm: null }).count, 5);
  assert.equal(summarize(map, { interests: ["ai"], level: "pro" }).all, 1);
  assert.equal(summarize(map, { interests: ["music"] }).count, 1);
  assert.equal(near.total, 6);
  assert.deepEqual(near.tops, [["ai", 3]]);
});

test("people store upserts, replaces, removes, expires and caps", async () => {
  const s = createPeopleStore(createMemoryKv());
  assert.equal((await s.upsert("bad id", { interests: ["ai"] })).ok, false);
  assert.equal((await s.upsert(ID(1), { interests: [] })).ok, false);
  assert.ok((await s.upsert(ID(1), { interests: ["ai"], ...BHOPAL }, 1000)).ok);
  assert.ok((await s.upsert(ID(1), { interests: ["web"], ...BHOPAL }, 2000)).ok); // same device replaces, never duplicates
  assert.equal((await s.audience({ interests: ["web"] })).total, 1);
  assert.equal((await s.audience({ interests: ["ai"] })).count, 0);
  await s.upsert(ID(2), { interests: ["ai"] }, 2000 + 181 * 864e5); // ID(1) is now older than 180 days
  assert.equal((await s.audience({ interests: ["ai"] })).total, 1);
  assert.ok((await s.remove(ID(2))).ok);
  assert.equal((await s.audience({ interests: ["ai"] })).total, 0);
});
