// Mechanical check for a candidate mockup. Substring/indexOf only where a
// regex would need escaping -- the first version of this file lost a
// backslash on the way to disk and silently reported 0/35 because `\b`
// became a backspace character.
import { readFileSync } from "node:fs";

const file = process.argv[2];
const s = readFileSync(file, "utf8");
const out = [];

const IDS = [
  "auth-legacy", "auth-users", "host-api", "host-edge", "host-web", "host-worker", "ingress-edge",
  "blob-store", "db-cache", "db-legacy", "db-primary", "db-replica", "db-search", "queue-jobs",
  "ai-chat", "ai-embed", "mail-legacy", "mail-tx", "pay-cards", "pay-legacy",
  "stack-lang", "stack-mobile", "stack-runtime", "stack-ui",
  "analytics-product", "obs-errors", "obs-metrics", "obs-trace",
  "agent-claude", "agent-cursor", "board", "ci", "vcs", "dns", "legacy-ledger",
];
const missing = IDS.filter((id) => !s.includes(id));
out.push(`ids present: ${IDS.length - missing.length}/35${missing.length ? "  MISSING: " + missing.join(", ") : ""}`);

const NAMES = [
  "Auth0", "Clerk", "Fly.io", "Cloudflare Workers", "NGINX", "Google Cloud Storage", "Redis",
  "MongoDB", "PostgreSQL", "Elasticsearch", "RabbitMQ", "Anthropic", "Hugging Face", "Mailgun",
  "Resend", "Stripe", "PayPal", "TypeScript", "Expo", ".NET", "React", "PostHog", "Sentry",
  "Datadog", "OpenTelemetry", "Claude Code", "Cursor", "Trello", "GitHub Actions", "GitHub",
  "Cloudflare", "acme-ledger",
];
const missingNames = NAMES.filter((n) => !s.includes(n));
out.push(`names present: ${NAMES.length - missingNames.length}/${NAMES.length}${missingNames.length ? "  MISSING: " + missingNames.join(", ") : ""}`);

// Every band label and the totals.
for (const label of ["Runs in production", "Holds data", "Calls out to", "Runs on", "Watched by", "Built and shipped by", "Registered at", "Unplaced"]) {
  if (!s.includes(label)) out.push(`band label MISSING: ${label}`);
}
out.push(`totals 35 / 48 / 21 present: 35=${s.includes("35")} 48=${s.includes("48")} 21=${s.includes("21")}`);

// Status words -- active must NOT be tagged, the other three must appear.
for (const w of ["phasing_out", "deprecated", "removed", "Phasing out", "Deprecated", "Removed"]) {
  const n = s.split(w).length - 1;
  if (n > 0) out.push(`status "${w}": ${n} occurrences`);
}

// Network. An <a href> to a documentation URL is a link, not a loaded asset;
// what matters is whether anything FETCHES at load.
const loaders = [...s.matchAll(/<(?:img|script|link|iframe|source|video|audio)\b[^>]*?(?:src|href)=["']([^"']+)["']/gi)]
  .map((m) => m[1])
  .filter((u) => /^(https?:)?\/\//i.test(u));
out.push(`remote LOADED assets: ${loaders.length ? loaders.join(" | ") : "none"}`);
out.push(`@import: ${/@import/i.test(s) ? "PRESENT" : "none"}`);
out.push(`fetch/XHR: ${/\bfetch\s*\(|XMLHttpRequest/.test(s) ? "PRESENT" : "none"}`);

// Tokens, exact.
const TOKENS = {
  "--color-bg": "#f4f1ea", "--color-surface": "#fbf9f4", "--color-surface-sunken": "#ece8de",
  "--color-header-fill": "#e9e4d8", "--color-text": "#24211c", "--color-text-muted": "#5e5a50",
  "--color-text-faint": "#7e7a6e", "--color-signal": "#d40010", "--color-hairline": "#d5cebe",
};
for (const [k, want] of Object.entries(TOKENS)) {
  const i = s.indexOf(k + ":");
  if (i < 0) { out.push(`${k}: ABSENT`); continue; }
  const got = s.slice(i + k.length + 1, s.indexOf(";", i)).trim().toLowerCase();
  out.push(`${k}: ${got}${got === want ? "" : "  <-- EXPECTED " + want}`);
}

// Chromatic leakage: hexes outside inline SVG (brand marks live there).
const noSvg = s.replace(/<svg[\s\S]*?<\/svg>/gi, "");
const hexes = [...new Set([...noSvg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
const allowed = new Set([...Object.values(TOKENS), "#000000", "#ffffff"]);
out.push(`unexpected hexes outside SVG: ${hexes.filter((h) => !allowed.has(h)).join(" ") || "none"}`);
const funcColour = [...new Set([...noSvg.matchAll(/\b(?:rgb|hsl)a?\([^)]*\)/gi)].map((m) => m[0]))];
out.push(`rgb()/hsl() outside SVG: ${funcColour.length ? funcColour.slice(0, 8).join(" | ") : "none"}`);

// Forbidden affordances.
const bad = [];
if (/<input\b[^>]*type=["']?(?:search|text)/i.test(s)) bad.push("text/search input");
if (/<input\b(?![^>]*type=)/i.test(s)) bad.push("bare <input>");
if (/placeholder=["'][^"']*(?:search|filter|find)/i.test(s)) bad.push("search-ish placeholder");
if (/>\s*\+\s*(?:New|Add)/i.test(s)) bad.push("+New / +Add");
if (/\bcontenteditable\b/i.test(s)) bad.push("contenteditable");
if (/<textarea|<form\b/i.test(s)) bad.push("form/textarea");
out.push(`forbidden affordances: ${bad.join(", ") || "none"}`);

// Shell presence.
for (const [label, needle] of [
  ["<footer>", "<footer"], ["profile", "rofile"], ["settings", "etting"], ["help", "elp"],
  ["popover", "opover"], ["Catalogus wordmark", "Catalogus"],
  ["view rail: Graph", "Graph"], ["view rail: Migrations", "Migration"],
]) {
  if (!s.includes(needle)) out.push(`shell MISSING: ${label}`);
}
// A logo glyph must NOT have been invented.
out.push(`svg count: ${(s.match(/<svg/gi) || []).length}`);
out.push(`bytes: ${s.length}`);

console.log(out.join("\n"));
