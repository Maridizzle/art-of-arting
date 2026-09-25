# The Art of Arting

Flux and Perchance image prompt builder. Five modes: Standalone Image, Overlay, Costume, Character, Scene. A React front end talks to a small Express server, and the server is the only thing that ever holds the OpenAI key.

## Layout

| Layer | Owns | Never touches |
| --- | --- | --- |
| `src/` (browser) | Toolbox parsing, brace resolution, lint, preview, copy | API keys, model names |
| `server/` | Provider dispatch, per-mode system prompts, key storage, request logging | Prompt content beyond passing it through |

- `server/prompts/*.txt` are the system prompts, one file per job. Edit them without touching code, then restart the server.
- `server/providers/openai.js` is the OpenAI adapter. Every provider exposes the same `send({ system, messages, maxTokens })`.
- `server/provider.js` picks the adapter from `PROVIDER` in `.env`.

Server routes: `POST /api/route` (Smart Fill), `POST /api/chips` (chip pools), `POST /api/analyze` (vision), `POST /api/generate` (three variations), `GET /api/health`.

## Run it

```
cp .env.example .env      # then paste your OpenAI key into .env
npm install
npm run dev:server        # terminal 1, Express on :8787
npm run dev:client        # terminal 2, Vite on :5173, proxies /api to :8787
```

Production: `npm run build` then `npm start`. The server serves `dist/` itself on one port.

`.env` is git-ignored. Never commit it.

## Unverified

The OpenAI request shape in `server/providers/openai.js` (Chat Completions endpoint, `max_completion_tokens`, `image_url` parts carrying a data URL) was written without access to OpenAI's docs. The model ID `gpt-6-astra` comes from news and blog reports, not from OpenAI's model list. Check both against https://platform.openai.com/docs before trusting a real run.

## Sign-off

Maridizzle
