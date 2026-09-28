// Provider dispatch. One adapter per provider, all exposing send().
// PROVIDER is a name or a comma list, e.g. "openai,xai": the first answers every call;
// the next is tried only when the one before it declines the request. Any other
// failure (bad key, rate limit, outage) stops and is reported, so a broken cheap
// provider never silently bills everything to the expensive one.

import * as openai from "./providers/openai.js";
import * as xai from "./providers/xai.js";

const providers = { openai, xai };

const chain = (process.env.PROVIDER || "openai").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
if (!chain.length) throw new Error("PROVIDER is empty");
for (const name of chain) {
  if (!providers[name]) throw new Error(`PROVIDER="${name}" is not one of: ${Object.keys(providers).join(", ")}`);
}

export const providerName = chain.join(",");

// callModel(args, parse, forced): send to each provider in order, parse the reply, and
// return { result, provider, next }. A decline, whether a refusal part from the adapter
// or a refusal-shaped reply caught by the parser, moves to the next provider. `next` names
// the provider after the one that answered, so the client can offer a manual redo when a
// provider complied with a tamer version instead of declining. With `forced` set to a
// provider name, only that provider is used and there is no fallback.
export async function callModel(args, parse, forced) {
  let order = chain;
  if (forced) {
    const name = String(forced).toLowerCase().trim();
    if (!providers[name]) throw new Error(`Unknown provider: ${name}`);
    order = [name];
  }
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    try {
      const raw = await providers[name].send(args);
      const pos = chain.indexOf(name);
      const next = pos >= 0 && pos < chain.length - 1 ? chain[pos + 1] : "";
      return { result: parse(raw), provider: name, next };
    } catch (err) {
      const declined = err && err.message === "MODEL_DECLINED";
      if (declined && i < order.length - 1) {
        console.warn(`[provider] ${name} declined; falling back to ${order[i + 1]}`);
        continue;
      }
      throw err;
    }
  }
}
