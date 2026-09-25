// Turns raw model text into JSON the client can use. Ported unchanged in
// behavior from the original callApi / callApiVision helpers, minus the fetch.

const DECLINE_RE = /\b(can't|cannot|won't|unable to|not able to|I'm sorry|guidelines|decline)\b/i;
// A refusal announces itself up front. Only the opening of the reply is checked so a
// legitimate prompt that mentions "guidelines" further in is not misread as a decline.
const looksDeclined = cleaned => DECLINE_RE.test(cleaned.slice(0, 80));

export function stripFences(raw) {
  return String(raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
}

// Generation and routing responses: try progressively looser extraction.
export function parseModelJson(raw) {
  const cleaned = stripFences(raw);
  if (!cleaned.includes("{") && !cleaned.includes(";;") && looksDeclined(cleaned)) {
    throw new Error("MODEL_DECLINED");
  }
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  const varMatch = cleaned.match(/"variations"\s*:\s*\[([\s\S]*?)\]/);
  if (varMatch) { try { return JSON.parse('{"variations":[' + varMatch[1] + "]}"); } catch {} }
  const found = [...cleaned.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).filter(s => s.length > 40);
  if (found.length) return { variations: found.slice(0, 3) };
  throw new Error("parse failed. Raw start: " + cleaned.slice(0, 120));
}

// Vision responses: stricter, no variations fallback.
export function parseVisionJson(raw) {
  const cleaned = stripFences(raw);
  if (!cleaned.includes("{") && looksDeclined(cleaned)) {
    throw new Error("MODEL_DECLINED");
  }
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  throw new Error("Could not parse response");
}
