# Outbound calling desk

Admin dashboard for bulk outbound calling. This MVP runs entirely on a **mock telephony provider**. Simulated calls are workflow events only. They are not placed on the telephone network, and Telnyx credentials are not required.

## Stack

Next.js, TypeScript, Tailwind CSS, shadcn-style UI components, PostgreSQL, Prisma, Zod.

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `AUTH_SECRET`.
2. Start PostgreSQL. For a local Prisma database:

```bash
npx prisma dev --detach --name outbound-calls
```

3. Apply the schema and seed sample data:

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

4. Start the app:

```bash
npm run dev
```

Sign in with the seeded admin:

- Email: `admin@outbound.local`
- Password: `ChangeMe123!`

Change `ADMIN_EMAIL` and `ADMIN_PASSWORD` before seeding if you want different credentials. The password is only applied when the user is first created.

## What the seed contains

Sample rows are marked **Seed** and campaign names start with `[SEED]`. The seed creates 50 leads, 3 campaigns, 100+ simulated call records, several active mock calls, and two generated tone files used as the human-answer and voicemail messages.

## Mock calling

Set a global result under Settings → Telephony, or a per-campaign mock result, to force `ANSWERED`, `VOICEMAIL`, `NO_ANSWER`, `BUSY`, or `FAILED`. Leave it on Random for a mixed development set.

Open the dashboard or Current Calls and leave the page open. Those pages poll every few seconds, advance due mock calls, and fill open campaign slots up to the concurrency limit.

## LiveKit and Telnyx

Outbound telephone calls are created by LiveKit. LiveKit opens one room per call and that room is the session until hangup. Telnyx (or another SIP carrier such as Telorca) is the SIP trunk LiveKit uses to reach the phone network.

1. In your SIP provider, create a credential SIP connection and an outbound number.
2. In the environment, set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_SIP_TRUNK_ID`, `CALLER_ID`, and `DIAL_PREFIX`.
3. Either set `LIVEKIT_SIP_TRUNK_ID` for a trunk that already points at your carrier, or set `TELNYX_SIP_USERNAME` and `TELNYX_SIP_PASSWORD` when using Telnyx auto-trunk creation.
4. Set `TELEPHONY_PROVIDER=livekit` and restart the app.

### Place Call AMD

Place Call uses **LiveKit Agents answering-machine detection** after the callee answers:

- **Human / uncertain / IVR** → desk microphone opens so you can talk
- **Machine voicemail** → the active voicemail message is played into the call
- **Mailbox unavailable** → hang up without leaving a message

AMD is provided by LiveKit (`voice.AMD`). On self-hosted LiveKit it uses **Deepgram** (STT) and **Google Gemini** (LLM) via `DEEPGRAM_API_KEY` and `GOOGLE_API_KEY` in `.env`.

Run the AMD worker in a second terminal while placing calls:

```bash
npm run agent
```

The worker registers as `place-call-amd` and is dispatched from `POST /api/calls/listen`. If the worker is not running, Place Call still dials; when answered you talk (no machine drop).

Settings → Telephony shows which LiveKit values are present. It does not store the secrets. Leave `TELEPHONY_PROVIDER=mock` to keep simulated calls.

## Production (Vercel + Railway)

Split deploy:

| Piece | Host |
|---|---|
| Next.js desk + APIs | **Vercel** |
| PostgreSQL | **Railway** |
| AMD worker (`npm run agent:start`) | **Railway** (second service) |
| LiveKit + SIP trunk | **Your self-hosted LiveKit** (must be public `wss://`) |

Audio uploads use `STORAGE_PROVIDER=db` in production (Postgres `StoredAudio`). Local disk (`STORAGE_PROVIDER=local`) only works for local development.

### Self-hosted LiveKit (WSS)

Browsers on `https://…vercel.app` cannot use plain `ws://IP`. Before go-live:

1. Put TLS in front of LiveKit (e.g. `wss://livekit.yourdomain.com`).
2. Open firewall ports for LiveKit signaling and media (UDP/TCP ranges your LiveKit config uses).
3. Keep SIP trunk settings (`LIVEKIT_SIP_TRUNK_ID`, `CALLER_ID`, `DIAL_PREFIX`).
4. Set `LIVEKIT_URL` to that public `wss://` or `https://` URL on both Vercel and the Railway agent.

### Railway

1. Create a project and **add Postgres**. Copy the connection URL (SSL on) as `DATABASE_URL`.
2. Add a **second service** from this repo for the AMD worker:
   - **Start command:** `npm run agent:start`
   - **Env vars:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `DEEPGRAM_API_KEY`, `GOOGLE_API_KEY` (optional `LIVEKIT_AGENT_NAME=place-call-amd`)
   - The worker does not need `DATABASE_URL`.
3. Deploy and confirm logs show the worker registered with LiveKit as `place-call-amd`.

### Vercel

1. Import the same GitHub repo (Next.js defaults).
2. Build uses `prisma migrate deploy && next build` (see `package.json`). `postinstall` runs `prisma generate`.
3. Set **Production** env vars:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Railway Postgres URL |
| `AUTH_SECRET` | New long random secret (not the local one) |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |
| `STORAGE_PROVIDER` | `db` |
| `TELEPHONY_PROVIDER` | `livekit` |
| `LIVEKIT_URL` | Public `wss://` or `https://` LiveKit URL |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Same as LiveKit server |
| `LIVEKIT_SIP_TRUNK_ID` | Existing trunk |
| `CALLER_ID` / `DIAL_PREFIX` | Same as local |
| `APP_TIMEZONE` | Ops timezone |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Only if you run seed against prod |

4. Deploy, then open the Vercel URL.

### One-time prod seed (optional)

With prod `DATABASE_URL` set locally (or in a Railway shell):

```bash
npx prisma migrate deploy
npx prisma db seed
```

Change `ADMIN_PASSWORD` before seeding production. Prefer `STORAGE_PROVIDER=db` when seeding prod so audio blobs land in Postgres.

### Go-live checklist

1. LiveKit reachable at `wss://…` from your laptop and from Railway.
2. Railway AMD worker online.
3. Vercel app loads and connects to Postgres.
4. Upload human-answer and voicemail messages (DB storage).
5. Settings → Telephony shows LiveKit fields configured.
6. Place Call: dial → AMD classifies → talk or voicemail drop.
7. Auth cookies work over HTTPS (`secure` when `NODE_ENV=production`).

Do not commit `.env`. Set secrets only in the Vercel and Railway dashboards.

## Scripts

- `npm run dev` — app
- `npm run agent` — LiveKit AMD worker (development)
- `npm run agent:start` — LiveKit AMD worker (production / Railway)
- `npm test` — unit tests for import, filters, the call state machine, the queue, and campaign transitions
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
