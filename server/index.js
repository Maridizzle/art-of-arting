// Art of Arting server. Owns provider dispatch, per-mode system prompts,
// key storage and request logging. It never inspects prompt content beyond
// passing it through, and it never logs prompt content.

import express from "express";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { send, providerName } from "./provider.js";
import { prompt } from "./prompts.js";
import { parseModelJson, parseVisionJson } from "./parse.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const MODES = new Set(["image", "overlay", "costume", "character", "scene"]);

// Hosted means reachable by strangers. Railway injects RAILWAY_ENVIRONMENT_NAME (per its
// variables reference); NODE_ENV=production covers other hosts.
const HOSTED = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT) || process.env.NODE_ENV === "production";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
if (HOSTED && !APP_PASSWORD) {
  console.error("Refusing to start: APP_PASSWORD is not set. A hosted server with no password lets anyone spend the API key.");
  process.exit(1);
}
if (!HOSTED && !APP_PASSWORD) console.warn("[auth] APP_PASSWORD not set; running open because this is not a hosted environment.");

const app = express();
// Behind Railway's proxy the client address arrives in X-Forwarded-For; trust one hop so the rate limit sees real IPs.
if (HOSTED || process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));

// Password gate: HTTP Basic Auth on everything except the health probe. The browser
// asks once and remembers. Username is ignored; only the password is checked.
const safeEqual = (a, b) => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
app.use((req, res, next) => {
  if (!APP_PASSWORD || req.path === "/api/health") return next();
  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (safeEqual(password, APP_PASSWORD)) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Art of Arting", charset="UTF-8"');
  res.status(401).send("Password required");
});

// Per-IP rate limit on model routes: a leaked link cannot drain the key in a loop.
// Fixed window, in memory, which is enough for one server and one user.
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_5MIN || 30);
const WINDOW_MS = 5 * 60 * 1000;
const hits = new Map(); // ip -> { count, resetAt }
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  const now = Date.now();
  const ip = req.ip || "unknown";
  let rec = hits.get(ip);
  if (!rec || rec.resetAt <= now) { rec = { count: 0, resetAt: now + WINDOW_MS }; hits.set(ip, rec); }
  rec.count += 1;
  if (rec.count > RATE_LIMIT) {
    res.set("Retry-After", String(Math.ceil((rec.resetAt - now) / 1000)));
    return res.status(429).json({ error: `Too many requests. Limit is ${RATE_LIMIT} per 5 minutes; try again shortly.` });
  }
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  next();
});

// Log method, path, status and duration only. Never bodies.
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api/")) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
    }
  });
  next();
});

const asyncRoute = fn => (req, res) => {
  fn(req, res).catch(err => {
    const msg = err && err.message ? err.message : "Unknown error";
    res.status(msg === "MODEL_DECLINED" ? 422 : 500).json({ error: msg });
  });
};

const requireMode = m => {
  if (!MODES.has(m)) throw new Error("Unknown mode: " + m);
  return m;
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: providerName });
});

// Smart Fill: route free text into fields for the given mode.
app.post("/api/route", asyncRoute(async (req, res) => {
  const mode = requireMode(req.body.mode);
  const text = String(req.body.text || "");
  if (!text.trim()) throw new Error("text is required");
  const raw = await send({ system: prompt("route", { mode }), messages: [{ role: "user", content: text }], maxTokens: 800 });
  res.json(parseModelJson(raw));
}));

// Chip pools from a theme or concept.
app.post("/api/chips", asyncRoute(async (req, res) => {
  const mode = requireMode(req.body.mode);
  const ctx = String(req.body.context || "").trim();
  if (!ctx) throw new Error("context is required");
  let system, user;
  if (mode === "overlay") {
    system = prompt("chips_overlay");
    user = `Theme: "${ctx}"`;
  } else if (mode === "costume") {
    system = prompt("chips_generic");
    user = `Costume theme:"${ctx}"\nReturn:{"top":["..."],"bottoms":["..."],"shoes":["..."],"accessories":["..."]}`;
  } else if (mode === "character") {
    system = prompt("chips_generic");
    user = `Character:"${ctx}"\nReturn:{"species":["..."],"body":["..."],"age":["..."],"archetype":["..."],"skin":["..."],"eyes":["..."],"hair":["..."],"expression":["..."],"world":["..."]}`;
  } else {
    throw new Error("chips are not available for mode: " + mode);
  }
  const raw = await send({ system, messages: [{ role: "user", content: user }], maxTokens: 1000 });
  res.json(parseModelJson(raw));
}));

// Vision: extract fields from an image.
app.post("/api/analyze", asyncRoute(async (req, res) => {
  const mode = requireMode(req.body.mode);
  const { imageBase64, mediaType, text } = req.body;
  if (!imageBase64 || !mediaType) throw new Error("imageBase64 and mediaType are required");
  const name = mode === "image" || mode === "character" || mode === "costume" ? "vision_" + mode : "vision_generic";
  const raw = await send({
    system: prompt(name),
    messages: [{
      role: "user",
      content: [
        { type: "image", mediaType, base64: imageBase64 },
        { type: "text", text: text || "Analyze this image per the instructions." },
      ],
    }],
    maxTokens: 1000,
  });
  res.json(parseVisionJson(raw));
}));

// Generate three variations from the labeled inputs block built in the browser.
app.post("/api/generate", asyncRoute(async (req, res) => {
  const mode = requireMode(req.body.mode);
  const input = String(req.body.input || "");
  if (!input.trim()) throw new Error("input is required");
  // Shared preamble (the five laws and syntax rules) followed by the mode's own output contract.
  const system = prompt("preamble") + "\n\n" + prompt("generate_" + mode);
  const raw = await send({ system, messages: [{ role: "user", content: input }], maxTokens: 2400 });
  res.json(parseModelJson(raw));
}));

// Production: serve the built client if dist/ exists.
const dist = join(ROOT, "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Art of Arting server on http://localhost:${PORT} (provider: ${providerName}${existsSync(dist) ? ", serving dist/" : ", dev mode: run vite separately"})`);
});
