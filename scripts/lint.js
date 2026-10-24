// Zero-dependency lint: syntax check every JS file, then ban risky patterns in browser code.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = ["src", "server", "test", "scripts"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`));
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status) { bad++; console.error(r.stderr); }
}
const RISKY = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\son[a-z]+=["']|setAttribute\(\s*["']on/;
for (const f of [...files.filter((x) => x.startsWith("src/")), "index.html"]) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (RISKY.test(line)) { bad++; console.error(`${f}:${i + 1} risky pattern: ${line.trim()}`); }
  });
}
console.log(`${files.length} files checked, ${bad} problems`);
process.exit(bad ? 1 : 0);
