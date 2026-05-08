# @compass/gemini-worker

Cloudflare Worker that proxies Compass app chat requests to Gemini 2.0 Flash.
Validates Firebase Auth ID tokens, persists per-user history in KV (last 10 turns),
and returns structured `{content, actions[]}` JSON responses.

## Why a Worker?

The Gemini API key cannot live in the Compass app bundle — anyone who
decompiles the APK would have a free LLM key billed to the project.
Worker holds the secret; app authenticates with its existing Firebase ID
token. We avoid Firebase Cloud Functions because Compass is on the Spark
plan (free tier, no Cloud Functions).

## Architecture

```
Compass app → POST /chat → Worker
                           │
                           ├─ verify Firebase ID token (jose + JWKS)
                           ├─ read history from KV
                           ├─ call Gemini with system prompt + context + history
                           ├─ append turns to KV
                           └─ return {reply, history}
```

## One-time setup

```bash
# 1. Install Wrangler globally (once per machine).
pnpm add -g wrangler          # or: npm i -g wrangler

# 2. Authenticate with Cloudflare (opens browser).
wrangler login

# 3. Get a Gemini API key from Google AI Studio.
#    https://aistudio.google.com/apikey
#    Free tier: 15 RPM, 1M tokens/day input.

# 4. Create the KV namespace and copy the returned id into wrangler.toml.
cd packages/gemini-worker
wrangler kv:namespace create compass-gemini-history
wrangler kv:namespace create compass-gemini-history --preview

# Edit wrangler.toml: paste the `id` and `preview_id` returned above.

# 5. Set the Gemini API key as a secret (NOT a var).
wrangler secret put GEMINI_API_KEY
# (paste the key from step 3)

# 6. Deploy.
wrangler deploy
# → returns: https://compass-gemini.<your-subdomain>.workers.dev

# 7. Drop that URL into app/app.config.ts under `extra.geminiWorkerUrl`.
```

## Local development

```bash
cd packages/gemini-worker
pnpm dev    # wrangler dev — exposes a local URL on :8787
```

You'll need `GEMINI_API_KEY` in a `.dev.vars` file at the package root
(NOT committed) for local dev.

## Endpoints

| Method | Path       | Purpose                                | Auth     |
|--------|------------|----------------------------------------|----------|
| GET    | /health    | Liveness probe                         | None     |
| POST   | /chat      | Send a user message, receive reply     | Required |
| GET    | /history   | Fetch saved conversation               | Required |
| DELETE | /history   | Clear saved conversation               | Required |

All authed endpoints require:
```
Authorization: Bearer <firebase-id-token>
```

## Cost (free tier headroom)

| Resource           | Free limit      | Estimated demo usage |
|--------------------|-----------------|----------------------|
| Worker requests    | 100k/day        | ~30/day              |
| KV reads           | 100k/day        | ~60/day              |
| KV writes          | 1k/day          | ~30/day              |
| Gemini Flash input | 1M tokens/day   | ~240k/day (30×8k)    |
| Gemini Flash RPM   | 15              | <1 sustained         |
