// Browser-side client for the server routes. The browser never holds an API
// key or a model name; it only sends prompt content to /api/* and gets JSON back.
//
// Error contract: the server answers non-2xx with {error: "<message>"}. The
// special message "MODEL_DECLINED" is passed through unchanged so the UI can
// show its softer wording for a refusal.

async function post(path, body) {
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
  return data;
}

// Smart Fill: route free text into the mode's fields.
export const routeText = (mode, text) => post("/route", { mode, text });

// Chip pools for overlay / costume / character from a theme or concept.
export const pullChips = (mode, context) => post("/chips", { mode, context });

// Vision: extract fields from an uploaded image.
export const analyzeImage = (mode, imageBase64, mediaType, text) =>
  post("/analyze", { mode, imageBase64, mediaType, text });

// Generate three variations. `input` is the labeled inputs block built in the browser.
export const generate = (mode, input) => post("/generate", { mode, input });
