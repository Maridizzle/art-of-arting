// Art of Arting server. Owns provider dispatch, per-mode system prompts,
// key storage and request logging. It never inspects prompt content beyond
// passing it through, and it never logs prompt content.

import express from "express";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { send, providerName } from "./provider.js";
import { prompt } from "./prompts.js";
import { parseModelJson, parseVisionJson } from "./parse.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const MODES = new Set(["image", "overlay", "costume", "character", "scene"]);

const app = express();
app.use(express.json({ limit: "8mb" }));

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
  const raw = await send({ system: prompt("generate", { mode }), messages: [{ role: "user", content: input }], maxTokens: 2400 });
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
