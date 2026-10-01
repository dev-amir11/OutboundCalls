# Outbound Calling Dashboard

Modular monolith for bulk outbound calling. The admin UI never talks to a carrier. Campaigns and the calling queue depend on a telephony interface. This MVP runs `MockTelephonyProvider` only. Mock calls are simulated workflow events. They are not placed on the telephone network.

## Request flow

```text
UI (App Router)
  -> Server Actions
    -> Application services
      -> Calling queue
        -> TelephonyProvider
          -> mock: MockTelephonyProvider
          -> livekit: LiveKitTelephonyProvider
```

With `TELEPHONY_PROVIDER=livekit`, LiveKit creates the outbound call and keeps the session:

```text
Calling queue
  -> LiveKit room (the session, one room per call)
    -> LiveKit SIP participant dials the lead
      -> Telnyx SIP trunk
        -> Phone
```

The room stays open for the life of the call. The queue mirrors `sip.callStatus` from that room into call history. Hanging up deletes the room, which ends the session and the Telnyx leg. Telnyx is not dialed by this app. Its SIP username, password, and phone number configure the LiveKit outbound trunk.

`TELEPHONY_PROVIDER=mock` remains the default and does not require LiveKit or Telnyx credentials. Mock calls still ask `LiveKitCallController` on answer, and that controller declines until a LiveKit session is the one that placed the call.

## Modules

| Module | Responsibility |
| --- | --- |
| Authentication | Email and password session for a single admin role |
| Dashboard | Lead and call statistics, current calls |
| Leads | Search, filters, lead detail |
| Import | Spreadsheet parse, validation, preview, history |
| Campaigns | Filter match, concurrency, start, pause, resume, cancel |
| Calling | Queue, concurrency, retry rules, duplicate protection |
| Call history / details | Outcomes, answer type, event timeline |
| Messages | Human-answer audio and voicemail audio |
| Settings | Active provider and mock outcome override |
| Telephony provider | `initiateCall`, `getCallStatus`, `hangupCall`, `playAudio` |
| Storage | Local files now, replaceable with object storage later |

## Call lifecycle

The queue stores every transition as a `CallEvent`.

```text
QUEUED -> DIALING -> RINGING
  -> ANSWERED_HUMAN -> PLAY_HUMAN_MESSAGE -> COMPLETED (successful)
  -> ANSWERING_MACHINE -> PLAY_VOICEMAIL -> COMPLETED (voicemail)
  -> NO_ANSWER
  -> BUSY
  -> FAILED
```

An administrator can cancel an active mock call. That ends the call as `CANCELLED`.

Answer type is an explicit field: `ANSWERED_HUMAN`, `ANSWERING_MACHINE`, `NO_ANSWER`, `BUSY`, or `FAILED`. The mock provider chooses this with a forced test result or a weighted random result. It is not production answering-machine detection.

## Queue

Each running campaign has its own concurrency limit. The tick fills free slots from pending campaign leads, skips any lead that already has an active call, and records the claim with a unique `activeLeadKey`. When a call reaches a terminal state the key is cleared. Retry is limited by max attempts and per-outcome flags. Successful and voicemail calls are not retried.

There is no separate worker process. Authenticated pages poll a server action that advances due mock calls and fills open slots. That is enough for this MVP and keeps the app a single deployable.

## Data

PostgreSQL via Prisma. Audio bytes live in local storage (`storage/audio`). The database stores file name, storage path, mime type, and duration.

## Replacing the mock

1. Implement `TelnyxProvider` methods against the carrier API.
2. Map carrier status into the existing call lifecycle.
3. Set `TELEPHONY_PROVIDER=telnyx` and supply carrier credentials.

Campaigns, filters, the queue, and the dashboard stay in place.
