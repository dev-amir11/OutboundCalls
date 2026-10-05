import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
  dispose,
} from "@livekit/rtc-node";
import { AccessToken, RoomServiceClient, SipClient } from "livekit-server-sdk";

/**
 * Away-from-phone voicemail drop:
 * 1. Dial and let it ring
 * 2. When the carrier mailbox answers (call goes active after ringing), wait for the greeting/beep
 * 3. Play our message into the mailbox
 * 4. Hang up so they can listen later
 */
const GREETING_WAIT_MS = 4_000;
const HUMAN_ANSWER_MS = 8_000; // answered sooner than this → treat as a person, hang up without message
const PHONE = process.argv[2] || "6466311744";

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

function normalizeHost(url) {
  return url.trim().replace(/\/$/, "").replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

function buildDialString(e164, prefix) {
  return `${digitsOnly(prefix)}${digitsOnly(e164)}`;
}

function toE164(phone) {
  const digits = digitsOnly(phone);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

function parseWav(path) {
  const sample = readFileSync(path);
  if (sample.toString("ascii", 0, 4) !== "RIFF" || sample.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Not a WAV file: ${path}`);
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = 8000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= sample.length) {
    const id = sample.toString("ascii", offset, offset + 4);
    const size = sample.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      channels = sample.readUInt16LE(start + 2);
      sampleRate = sample.readUInt32LE(start + 4);
      bitsPerSample = sample.readUInt16LE(start + 14);
    } else if (id === "data") {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error(`No data chunk in ${path}`);
  if (bitsPerSample !== 16) throw new Error(`Need 16-bit PCM WAV, got ${bitsPerSample}-bit: ${path}`);
  const pcm = sample.subarray(dataOffset, dataOffset + dataSize);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  return { channels, sampleRate, samples, path };
}

const rawUrl = process.env.LIVEKIT_URL?.trim() ?? "";
const apiKey = process.env.LIVEKIT_API_KEY?.trim() ?? "";
const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? "";
const trunkId = process.env.LIVEKIT_SIP_TRUNK_ID?.trim() ?? "";
const callerId = digitsOnly(process.env.CALLER_ID?.trim() || "13156938488");
const prefix = digitsOnly(process.env.DIAL_PREFIX?.trim() || "43084");

if (!rawUrl || !apiKey || !apiSecret || !trunkId) {
  console.error("Missing LiveKit env");
  process.exit(1);
}

const wavCandidates = [
  join(process.cwd(), "public/drop-voicemail.wav"),
  join(process.cwd(), "public/test-voicemail.wav"),
  join(process.cwd(), "storage/audio/b270d8fa-ff51-4cca-9115-ba3cf073f2f6-seed-voicemail.wav"),
];
let wav;
for (const candidate of wavCandidates) {
  try {
    wav = parseWav(candidate);
    break;
  } catch (error) {
    console.warn(`Skip ${candidate}: ${error instanceof Error ? error.message : error}`);
  }
}
if (!wav) {
  console.error("No playable voicemail WAV found.");
  process.exit(1);
}

const e164 = toE164(PHONE);
const host = normalizeHost(rawUrl);
const rooms = new RoomServiceClient(host, apiKey, apiSecret);
const sip = new SipClient(host, apiKey, apiSecret);
const roomName = `desk-${crypto.randomUUID()}`;
const dialed = buildDialString(e164, prefix);

console.log("Mode: leave a voicemail if they are away (mailbox answers after ringing).");
console.log(`Dialing ${e164} as ${dialed} (from ${callerId})`);
console.log(`Message: ${wav.path} (${wav.sampleRate} Hz, ${wav.channels} ch, ${Math.round(wav.samples.length / wav.sampleRate / wav.channels)}s)`);
console.log(`Room: ${roomName}`);

await rooms.createRoom({
  name: roomName,
  emptyTimeout: 8 * 60,
  departureTimeout: 20,
  metadata: JSON.stringify({ to: e164, dialed, purpose: "away-voicemail-drop" }),
});

try {
  await sip.createSipParticipant(trunkId, dialed, roomName, {
    fromNumber: callerId,
    participantIdentity: `phone-${roomName}`,
    participantName: e164,
    playDialtone: false,
    ringingTimeout: 90,
    maxCallDuration: 5 * 60,
    waitUntilAnswered: false,
  });
} catch (error) {
  await rooms.deleteRoom(roomName).catch(() => undefined);
  console.error("SIP dial failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const token = new AccessToken(apiKey, apiSecret, {
  identity: `vm-${roomName}`,
  ttl: "15m",
});
token.addGrant({
  room: roomName,
  roomJoin: true,
  canSubscribe: true,
  canPublish: true,
});

const room = new Room();
await room.connect(rawUrl, await token.toJwt(), { autoSubscribe: true, dynacast: true });
console.log("Joined room. Ringing… if nobody picks up, we wait for their carrier mailbox.");

let ringStarted = null;
let missingStreak = 0;
let outcome = "no_answer";

async function playVoicemail() {
  console.log(`Mailbox answered. Waiting ${GREETING_WAIT_MS / 1000}s for greeting/beep, then dropping message…`);
  await new Promise((r) => setTimeout(r, GREETING_WAIT_MS));

  const source = new AudioSource(wav.sampleRate, wav.channels);
  const track = LocalAudioTrack.createAudioTrack("voicemail", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(track, options);
  await new Promise((r) => setTimeout(r, 500));

  const frameSamples = Math.max(wav.channels, Math.floor(wav.sampleRate * 0.02) * wav.channels);
  let written = 0;
  while (written < wav.samples.length) {
    const end = Math.min(written + frameSamples, wav.samples.length);
    const chunk = wav.samples.subarray(written, end);
    const samplesPerChannel = Math.trunc(chunk.length / wav.channels) || 1;
    await source.captureFrame(new AudioFrame(chunk, wav.sampleRate, wav.channels, samplesPerChannel));
    written = end;
  }
  await source.waitForPlayout();
  await track.close();
  outcome = "voicemail_left";
  console.log("Voicemail left in their mailbox.");
}

try {
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    let status = "dialing";
    try {
      const participants = await rooms.listParticipants(roomName);
      const phone = participants.find((p) => p.identity.startsWith("phone-"));
      if (!phone) {
        missingStreak += 1;
        console.log(`[${i + 1}s] phone leg missing (${missingStreak})`);
        // brief gaps can happen while carrier transfers to voicemail
        if (missingStreak >= 8) break;
        continue;
      }
      missingStreak = 0;
      status = phone.attributes?.["sip.callStatus"] ?? "dialing";
    } catch {
      console.log(`[${i + 1}s] room gone`);
      break;
    }

    if ((status === "ringing" || status === "dialing") && ringStarted === null) {
      ringStarted = Date.now();
    }
    console.log(`[${i + 1}s] ${status}`);

    if (status === "hangup" || status === "disconnected") break;

    if (status === "active" || status === "automation") {
      const rangFor = ringStarted ? Date.now() - ringStarted : 0;
      const mailbox = status === "automation" || rangFor >= HUMAN_ANSWER_MS;
      if (mailbox) {
        await playVoicemail();
      } else {
        outcome = "human_answered";
        console.log(`Someone answered after ${Math.round(rangFor / 1000)}s. Not leaving a mailbox message. Hanging up.`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      break;
    }
  }
} finally {
  await room.disconnect().catch(() => undefined);
  await rooms.deleteRoom(roomName).catch(() => undefined);
  await dispose().catch(() => undefined);
}

if (outcome === "no_answer") {
  console.log("Their phone never connected us to a mailbox (ring-out / carrier hangup).");
  console.log("We can only leave a message after the carrier voicemail answers the call.");
}
console.log(`Done. outcome=${outcome} room=${roomName}`);
