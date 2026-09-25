// Provider dispatch. One adapter per provider, all exposing send().
// Add a new provider by dropping a file in providers/ and listing it here.

import * as openai from "./providers/openai.js";

const providers = { openai };

const chosen = (process.env.PROVIDER || "openai").toLowerCase();
const active = providers[chosen];
if (!active) {
  throw new Error(`PROVIDER="${chosen}" is not one of: ${Object.keys(providers).join(", ")}`);
}

export const providerName = active.name;
export const send = active.send;
