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

## Hosting (phone access)

The server is safe to expose only with a password. When `RAILWAY_ENVIRONMENT` or `NODE_ENV=production` is set it refuses to start unless `APP_PASSWORD` is set. The browser asks for the password once (HTTP Basic Auth) and remembers it. Model routes are also rate limited per IP address (`RATE_LIMIT_PER_5MIN`, default 30).

On Railway:

1. New project from this GitHub repo, pick the branch.
2. Variables: `OPENAI_API_KEY`, `OPENAI_MODEL`, `APP_PASSWORD`, `OPENAI_MAX_OUTPUT_TOKENS`, `OPENAI_REASONING_EFFORT`. Railway supplies `PORT` itself.
3. Build command `npm run build`, start command `npm start`. The server serves the built page on one port.
4. Set a monthly spending limit on the OpenAI side before the first deploy.

A `railway.json` with the build and start commands is pending until Railway's current config-as-code reference can be checked.

## Verified

Checked 2026-09-25 against OpenAI's developer documentation (developers.openai.com, vendor primary):

- `gpt-6-astra` is listed on the models page as the recommended starting point, with image input supported.
- The adapter uses the Responses API (`POST /v1/responses`), which OpenAI recommends over Chat Completions for text generation. Field names follow the text, images-and-vision, and reasoning guides and the Responses create reference.
- `max_output_tokens` includes reasoning tokens. OpenAI recommends reserving at least 25,000, which is the default in `.env.example`. A cap that is too small returns status `incomplete` with no text.

Pages: `/api/docs/models`, `/api/docs/guides/text`, `/api/docs/guides/images-vision`, `/api/docs/guides/reasoning`, `/api/reference/resources/responses/methods/create`.

## Sign-off

Maridizzle
