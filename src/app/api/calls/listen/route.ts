import { AccessToken, AgentDispatchClient, RoomServiceClient, SipClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PLACE_CALL_AMD_AGENT } from "@/providers/livekit/amd";
import { browserLiveKitUrl, buildDialString, digitsOnly } from "@/providers/livekit/dial";
import { normalizeLiveKitHost } from "@/providers/livekit/config";
import { normalizePhone } from "@/services/leads/phone";
import { findActiveMessage } from "@/repositories/message-repository";
import { appendLiveKitEvent, missingPhoneMeansEnded, noteSipStatus, startLiveKitSession } from "@/services/livekit/session-log";

const ROOM_NAME = /^desk-[0-9a-f-]{36}$/i;

function liveKitSettings() {
  const rawUrl = process.env.LIVEKIT_URL?.trim() ?? "";
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? "";
  const trunkId = process.env.LIVEKIT_SIP_TRUNK_ID?.trim() ?? "";
  const callerId = digitsOnly(process.env.CALLER_ID?.trim() || "13156938488");
  const prefix = digitsOnly(process.env.DIAL_PREFIX?.trim() || "43084");
  if (!rawUrl || !apiKey || !apiSecret || !trunkId || !callerId || !prefix) {
    throw new Error("LiveKit calling is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_SIP_TRUNK_ID, CALLER_ID, and DIAL_PREFIX.");
  }
  return {
    host: normalizeLiveKitHost(rawUrl),
    browserUrl: browserLiveKitUrl(rawUrl),
    apiKey,
    apiSecret,
    trunkId,
    callerId,
    prefix,
  };
}

function clients() {
  const settings = liveKitSettings();
  return {
    settings,
    rooms: new RoomServiceClient(settings.host, settings.apiKey, settings.apiSecret),
    sip: new SipClient(settings.host, settings.apiKey, settings.apiSecret),
    agents: new AgentDispatchClient(settings.host, settings.apiKey, settings.apiSecret),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function roomIsGone(error: unknown) {
  if (!(error instanceof Error) || error.message === "timeout") return false;
  const status = "status" in error ? Number((error as { status?: unknown }).status) : NaN;
  return status === 404 || /not found|does not exist/i.test(error.message);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone.ok) return NextResponse.json({ error: phone.reason }, { status: 400 });

  let settings: ReturnType<typeof liveKitSettings>;
  let rooms: RoomServiceClient;
  let sip: SipClient;
  let agents: AgentDispatchClient;
  try {
    ({ settings, rooms, sip, agents } = clients());
  } catch (error) {
    const message = error instanceof Error ? error.message : "LiveKit is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const roomName = `desk-${crypto.randomUUID()}`;
  const participantIdentity = `phone-${roomName}`;
  const dialed = buildDialString(phone.e164, settings.prefix);

  await rooms.createRoom({
    name: roomName,
    emptyTimeout: 30 * 60,
    departureTimeout: 20,
    metadata: JSON.stringify({ to: phone.e164, dialed }),
  });

  const session = await startLiveKitSession({
    userId: user.id,
    roomName,
    phoneDisplay: phone.display,
    phoneE164: phone.e164,
    callerId: settings.callerId,
    dialed,
  });

  let amd = false;
  try {
    await agents.createDispatch(roomName, PLACE_CALL_AMD_AGENT, {
      metadata: JSON.stringify({
        participantIdentity,
        sessionId: session.id,
      }),
    });
    amd = true;
    await appendLiveKitEvent(roomName, "AGENT", "LiveKit AMD agent dispatched.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "AMD dispatch failed.";
    await appendLiveKitEvent(roomName, "AGENT", `AMD dispatch failed: ${message}. Desk will talk if answered.`);
  }

  try {
    await sip.createSipParticipant(settings.trunkId, dialed, roomName, {
      fromNumber: settings.callerId,
      participantIdentity,
      participantName: phone.display,
      playDialtone: false,
      ringingTimeout: 120,
      maxCallDuration: 30 * 60,
      waitUntilAnswered: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LiveKit could not place the call.";
    await appendLiveKitEvent(roomName, "FAILED", message);
    await rooms.deleteRoom(roomName).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const token = new AccessToken(settings.apiKey, settings.apiSecret, {
    identity: `listen-${roomName}`,
    ttl: "45m",
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
  });

  const voicemail = await findActiveMessage("VOICEMAIL").catch(() => null);
  const humanAnswer = await findActiveMessage("HUMAN_ANSWER").catch(() => null);

  return NextResponse.json({
    roomName,
    sessionId: session.id,
    amd,
    voicemailUrl: voicemail ? `/api/audio/${voicemail.id}` : null,
    voicemailName: voicemail?.name ?? null,
    humanAnswerUrl: humanAnswer ? `/api/audio/${humanAnswer.id}` : null,
    humanAnswerName: humanAnswer?.name ?? null,
    token: await token.toJwt(),
    url: settings.browserUrl,
    dialed,
    display: phone.display,
    callerId: settings.callerId,
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roomName = new URL(request.url).searchParams.get("room") ?? "";
  if (!ROOM_NAME.test(roomName)) return NextResponse.json({ error: "Unknown room." }, { status: 400 });

  const { rooms } = clients();
  try {
    const participants = await withTimeout(rooms.listParticipants(roomName), 3000);
    const phone = participants.find((participant) => participant.identity.startsWith("phone-"));
    if (!phone) {
      if (!(await missingPhoneMeansEnded(roomName))) return NextResponse.json({ roomExists: true, status: "pending" });
      await noteSipStatus(roomName, "hangup", false);
      return NextResponse.json({ roomExists: false, status: "hangup" });
    }
    const status = phone.attributes?.["sip.callStatus"] ?? "dialing";
    await noteSipStatus(roomName, status, true);
    return NextResponse.json({ roomExists: true, status });
  } catch (error) {
    if (!roomIsGone(error)) return NextResponse.json({ roomExists: true, status: "pending" });
    await noteSipStatus(roomName, "hangup", false);
    return NextResponse.json({ roomExists: false, status: "hangup" });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { roomName?: unknown; outcome?: unknown; reason?: unknown } | null;
  const roomName = String(body?.roomName ?? "");
  if (!ROOM_NAME.test(roomName)) return NextResponse.json({ error: "Unknown room." }, { status: 400 });
  const kind = body?.outcome === "FAILED" ? "FAILED" : "HUNG_UP";
  const reason = String(body?.reason ?? "").slice(0, 240) || (kind === "FAILED" ? "Call failed." : "Call ended.");
  await appendLiveKitEvent(roomName, kind, reason);
  const { rooms } = clients();
  await withTimeout(rooms.deleteRoom(roomName), 3000).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
