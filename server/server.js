import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

try { // minimal .env loader (no dependency)
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
  for (const l of readFileSync(file, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* no .env: local fallback mode */ }

const port = process.env.PORT || 3000;
createApp({ key: process.env.OPENROUTER_API_KEY }).listen(port, () => console.log(`Nukkad running on port ${port}`));
