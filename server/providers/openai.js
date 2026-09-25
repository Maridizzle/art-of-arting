// OpenAI adapter, Responses API. Same interface every provider must expose:
//   send({ system, messages, maxTokens }) -> string (the model's text)
//
// messages: [{ role: "user", content: string | [{type:"text",text} | {type:"image", mediaType, base64}] }]
// Image parts are provider-neutral and converted here.
//
// Verified 2026-09-25 against OpenAI's developer docs:
//   POST {base}/responses with "instructions" (system text), "input" (messages),
//   "max_output_tokens", "reasoning": {"effort"}. Text parts are "input_text",
//   image parts are "input_image" with a data: URL string in "image_url".
//   Reply text is in output[].content[] parts of type "output_text"; a part of
//   type "refusal" is a decline. max_output_tokens counts reasoning tokens too,
//   so OpenAI recommends reserving at least 25,000. gpt-6-astra rejects
//   reasoning effort "none".
// Pages: /api/docs/guides/text, /api/docs/guides/images-vision,
//        /api/docs/guides/reasoning, /api/reference/resources/responses/methods/create

const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
// Floor for max_output_tokens. Reasoning tokens are billed inside this cap, so a
// small value can return status "incomplete" before any visible text.
const outputFloor = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 25000);
const effort = process.env.OPENAI_REASONING_EFFORT || "low";

if (!key) console.warn("[openai] OPENAI_API_KEY is not set; every model call will fail.");
if (!model) console.warn("[openai] OPENAI_MODEL is not set; every model call will fail.");

function toInputContent(content) {
  if (typeof content === "string") return [{ type: "input_text", text: content }];
  return content.map(part => {
    if (part.type === "text") return { type: "input_text", text: part.text };
    if (part.type === "image") {
      return { type: "input_image", image_url: `data:${part.mediaType};base64,${part.base64}`, detail: "auto" };
    }
    throw new Error("Unknown message part type: " + part.type);
  });
}

// Collect every output_text part in order. The docs say the text is not
// guaranteed to sit at output[0].content[0].
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

export async function send({ system, messages, maxTokens = 1000 }) {
  if (!key || !model) throw new Error("Server is missing OPENAI_API_KEY or OPENAI_MODEL");
  const body = {
    model,
    instructions: system,
    input: messages.map(m => ({ role: m.role, content: toInputContent(m.content) })),
    max_output_tokens: Math.max(maxTokens, outputFloor),
    reasoning: { effort },
  };
  const res = await fetch(base + "/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error("OpenAI returned non-JSON (" + res.status + ")"); }
  if (!res.ok || data.error) {
    throw new Error((data.error && data.error.message) || "OpenAI error " + res.status);
  }
  const text = extractText(data);
  if (data.status === "incomplete") {
    const reason = (data.incomplete_details && data.incomplete_details.reason) || "unknown";
    if (!text) throw new Error(`OpenAI stopped early (${reason}). Raise OPENAI_MAX_OUTPUT_TOKENS or lower OPENAI_REASONING_EFFORT.`);
    console.warn("[openai] response incomplete:", reason);
  }
  return text;
}

export const name = "openai";
