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

## Scripts

- `npm run dev` — app
- `npm run agent` — LiveKit AMD worker for Place Call
- `npm test` — unit tests for import, filters, the call state machine, the queue, and campaign transitions
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
