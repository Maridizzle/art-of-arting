// xAI (Grok) adapter, Responses API. Same interface every provider must expose:
//   send({ system, messages, maxTokens }) -> string (the model's text)
//
// Verified 2026-09-27 against docs.x.ai (quickstart, image understanding, REST reference,
// models page):
//   POST https://api.x.ai/v1/responses, Authorization: Bearer <key>.
//   "input" is a string or an array of {role, content}; roles system, user, assistant may
//   appear in any order. Content parts are "input_text" {text} and "input_image"
//   {image_url: "data:image/jpeg;base64,...", detail}. Images: jpg/jpeg or png, 20 MiB max.
//   Reply text is in output[] items of type "message", content[] parts of type
//   "output_text". status is completed, in_progress or incomplete.
//   grok-4.7 is the flagship, text and image input, 500k context; reasoning efforts
//   low, medium, high, xhigh (default high). "<model>-latest" aliases the newest version.
//   The docs advise against server-side storage when sending images, so store is false.
//   Chat Completions is listed as legacy.

const key = process.env.XAI_API_KEY;
const model = process.env.XAI_MODEL;
const base = (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/+$/, "");
// Reasoning tokens are billed inside the output cap (usage reports reasoning_tokens under
// output_tokens_details), so keep the floor generous.
const outputFloor = Number(process.env.XAI_MAX_OUTPUT_TOKENS || 25000);
// Only some models take a reasoning effort (docs list levels for grok-4.7, none for
// grok-4.20). Empty means send none and let the model use its own default.
const effort = (process.env.XAI_REASONING_EFFORT || "").trim();

if (!key) console.warn("[xai] XAI_API_KEY is not set; every model call will fail.");
if (!model) console.warn("[xai] XAI_MODEL is not set; every model call will fail.");

function toInputContent(content) {
  if (typeof content === "string") return [{ type: "input_text", text: content }];
  return content.map(part => {
    if (part.type === "text") return { type: "input_text", text: part.text };
    if (part.type === "image") {
      return { type: "input_image", image_url: `data:${part.mediaType};base64,${part.base64}`, detail: "high" };
    }
    throw new Error("Unknown message part type: " + part.type);
  });
}

// Collect every output_text part in order; reasoning items are skipped.
function extractText(data) {
  const texts = [];
  let refusal = null;
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text" && typeof part.text === "string") texts.push(part.text);
      else if (part.type === "refusal") refusal = part.refusal || "refused";
    }
  }
  if (!texts.length && refusal) throw new Error("MODEL_DECLINED");
  return texts.join("");
}

async function post(body) {
  const res = await fetch(base + "/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error("xAI returned non-JSON (" + res.status + ")"); }
  if (!res.ok || data.error) {
    const msg = data.error && (data.error.message || (typeof data.error === "string" ? data.error : null));
    throw new Error(msg || "xAI error " + res.status);
  }
  return data;
}

export async function send({ system, messages, maxTokens = 1000 }) {
  if (!key || !model) throw new Error("Server is missing XAI_API_KEY or XAI_MODEL");
  const body = {
    model,
    store: false,
    input: [
      { role: "system", content: system },
      ...messages.map(m => ({ role: m.role, content: toInputContent(m.content) })),
    ],
    max_output_tokens: Math.max(maxTokens, outputFloor),
  };
  if (effort) body.reasoning = { effort };
  let data;
  try {
    data = await post(body);
  } catch (err) {
    // A model that takes no effort parameter rejects the whole call. Retry once without it.
    if (body.reasoning && /reasoning/i.test(err.message)) {
      console.warn(`[xai] ${model} rejected reasoning effort "${effort}"; retrying without it. Clear XAI_REASONING_EFFORT to stop this warning.`);
      delete body.reasoning;
      data = await post(body);
    } else {
      throw err;
    }
  }
  const text = extractText(data);
  if (data.status === "incomplete") {
    const reason = (data.incomplete_details && data.incomplete_details.reason) || "unknown";
    if (!text) throw new Error(`xAI stopped early (${reason}). Raise XAI_MAX_OUTPUT_TOKENS or lower XAI_REASONING_EFFORT.`);
    console.warn("[xai] response incomplete:", reason);
  }
  return text;
}

export const name = "xai";
