// OpenAI adapter. Same interface every provider must expose:
//   send({ system, messages, maxTokens }) -> string (the model's text)
//
// messages: [{ role: "user", content: string | [{type:"text",text} | {type:"image", mediaType, base64}] }]
// Image parts are provider-neutral and converted here.
//
// UNVERIFIED: this request shape (POST {base}/chat/completions with
// max_completion_tokens, and image_url parts carrying a data: URL) is written
// from memory. The OpenAI docs could not be reached from the build
// environment. Check https://platform.openai.com/docs/api-reference/chat
// before relying on it, and adjust here if the shape has changed.

const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

if (!key) console.warn("[openai] OPENAI_API_KEY is not set; every model call will fail.");
if (!model) console.warn("[openai] OPENAI_MODEL is not set; every model call will fail.");

function toOpenAiContent(content) {
  if (typeof content === "string") return content;
  return content.map(part => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") {
      return { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.base64}` } };
    }
    throw new Error("Unknown message part type: " + part.type);
  });
}

export async function send({ system, messages, maxTokens = 1000 }) {
  if (!key || !model) throw new Error("Server is missing OPENAI_API_KEY or OPENAI_MODEL");
  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      ...messages.map(m => ({ role: m.role, content: toOpenAiContent(m.content) })),
    ],
  };
  const res = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error("OpenAI returned non-JSON (" + res.status + ")"); }
  if (!res.ok || data.error) {
    throw new Error((data.error && data.error.message) || "OpenAI error " + res.status);
  }
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  return (msg && msg.content) || "";
}

export const name = "openai";
