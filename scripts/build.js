// Vercel build: copy ONLY the public site into /public so server code, tests and docs are never exposed as static files.
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";

rmSync("public", { recursive: true, force: true });
mkdirSync("public", { recursive: true });
for (const f of ["index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "og.png", "src", "posters"]) {
  if (existsSync(f)) cpSync(f, `public/${f}`, { recursive: true });
}
console.log("public/ ready");
