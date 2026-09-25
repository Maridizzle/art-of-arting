// Loads system prompts from server/prompts/*.txt so they can be edited
// without touching code. Files are read once at startup; restart the server
// after editing one (dev:server uses --watch, but only for .js files).

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");

const cache = {};
for (const f of readdirSync(DIR)) {
  if (extname(f) !== ".txt") continue;
  cache[basename(f, ".txt")] = readFileSync(join(DIR, f), "utf8").replace(/\r\n/g, "\n").trim();
}

// prompt("route", {mode: "image"}) fills {{mode}} placeholders.
export function prompt(name, vars = {}) {
  const text = cache[name];
  if (text === undefined) throw new Error("Unknown prompt file: " + name + ".txt");
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ""));
}

export const promptNames = () => Object.keys(cache);
