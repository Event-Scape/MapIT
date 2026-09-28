import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const root = process.cwd();
const outPath = path.join(root, "frontend", "env.js");

const env = {
  MB_TOK: process.env.MB_TOK ?? process.env.MAPBOX_PUBLIC_TOKEN ?? "",
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  GOOGLE_KEY: process.env.GOOGLE_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "",
};

const content = `// Auto-generated. Do not commit.
window.__ENV = window.__ENV || {};
window.__ENV.MB_TOK = \`${esc(env.MB_TOK)}\`;
window.__ENV.SUPABASE_URL = \`${esc(env.SUPABASE_URL)}\`;
window.__ENV.SUPABASE_ANON_KEY = \`${esc(env.SUPABASE_ANON_KEY)}\`;
window.__ENV.GOOGLE_KEY = \`${esc(env.GOOGLE_KEY)}\`;
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, "utf8");

console.log(`[MapIT] wrote ${outPath}`);

