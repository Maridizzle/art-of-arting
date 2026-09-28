// Browser-side client for the server routes. The browser never holds an API
// key or a model name; it only sends prompt content to /api/* and gets JSON back.
//
// Error contract: the server answers non-2xx with {error: "<message>"}. The
// special message "MODEL_DECLINED" is passed through unchanged so the UI can
// show its softer wording for a refusal.

// Bypass toggle: when set, every call goes to this provider alone (no chain, no
// fallback). A call that names its own provider, such as a Redo, keeps its own.
let forcedProvider = "";
export const setForcedProvider = name => { forcedProvider = String(name || ""); };
export const getForcedProvider = () => forcedProvider;

async function post(path, body) {
  if (forcedProvider && body.provider === undefined) body = { ...body, provider: forcedProvider };
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error("Server returned a non-JSON response (" + res.status + ")");
  }
  if (!res.ok || (data && data.error)) {
    throw new Error((data && data.error) || "Request failed (" + res.status + ")");
  }
  // Which provider answered, from the X-Provider header. Non-enumerable so it never
  // lands in the form state when a result is spread into the fields.
  if (data && typeof data === "object") {
    Object.defineProperty(data, "provider", { value: res.headers.get("X-Provider") || "", enumerable: false });
    // The provider after the one that answered, for a manual redo. Empty when none.
    Object.defineProperty(data, "providerNext", { value: res.headers.get("X-Provider-Next") || "", enumerable: false });
  }
  return data;
}

// Smart Fill: route free text into the mode's fields.
// card=true marks a pasted character sheet (Character mode): extracted, not developed.
export const routeText = (mode, text, card = false, provider) => post("/route", { mode, text, card, provider });

// Chip pools for overlay / costume / character from a theme or concept.
export const pullChips = (mode, context) => post("/chips", { mode, context });

// Vision: extract fields from an uploaded image.
export const analyzeImage = (mode, imageBase64, mediaType, text) =>
  post("/analyze", { mode, imageBase64, mediaType, text });

// Generate three variations. `input` is the labeled inputs block built in the browser.
export const generate = (mode, input, provider) => post("/generate", { mode, input, provider });
