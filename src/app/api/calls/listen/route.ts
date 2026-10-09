import { AccessToken, AgentDispatchClient, RoomServiceClient, SipClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PLACE_CALL_AMD_AGENT } from "@/providers/livekit/amd";
import { browserLiveKitUrl, buildDialStringWithOption, digitsOnly, disconnectReasonLabel } from "@/providers/livekit/dial";
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
  const prefix = digitsOnly(process.env.DIAL_PREFIX?.trim() || "");
  if (!rawUrl || !apiKey || !apiSecret || !trunkId || !callerId) {
    throw new Error("LiveKit calling is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_SIP_TRUNK_ID, and CALLER_ID.");
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

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const text = typeof error.message === "string" ? error.message : "";
    if (text === "timeout") return "LiveKit API timed out. Check LIVEKIT_URL is reachable.";
    return text || fallback;
  }
  return fallback;
}

function sipErrorDetail(error: unknown) {
  if (!(error instanceof Error)) return { message: "LiveKit could not place the call." };
  const meta =
    "metadata" in error && error.metadata && typeof error.metadata === "object"
      ? (error.metadata as Record<string, string>)
      : null;
  return {
    message: errorText(error, "LiveKit could not place the call."),
    sipStatusCode: meta?.sip_status_code ?? meta?.sipStatusCode ?? null,
    sipStatus: meta?.sip_status ?? meta?.sipStatus ?? null,
  };
}

async function resolveTrunk(sip: SipClient, trunkId: string) {
  try {
    const trunks = await withTimeout(sip.listSipOutboundTrunk(), 8000);
    const trunk = trunks.find((item) => item.sipTrunkId === trunkId);
    if (!trunk) return { name: null, address: null };
    return { name: trunk.name || null, address: trunk.address || null };
  } catch {
    return { name: null, address: null };
  }
}

function sipAttrs(attributes: Record<string, string> | undefined) {
  if (!attributes) return {};
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith("sip.")));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { phone?: unknown; usePrefix?: unknown } | null;
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone.ok) return NextResponse.json({ error: phone.reason }, { status: 400 });
  const usePrefix = body?.usePrefix !== false;

  let settings: ReturnType<typeof liveKitSettings>;
  let rooms: RoomServiceClient;
  let sip: SipClient;
  let agents: AgentDispatchClient;
  try {
    ({ settings, rooms, sip, agents } = clients());
  } catch (error) {
    return NextResponse.json({ error: errorText(error, "LiveKit is not configured.") }, { status: 500 });
  }
  if (usePrefix && !settings.prefix) {
    return NextResponse.json({ error: "DIAL_PREFIX is not set. Dial without prefix, or add DIAL_PREFIX to the environment." }, { status: 400 });
  }

  const roomName = `desk-${crypto.randomUUID()}`;
  const participantIdentity = `phone-${roomName}`;
  const dialed = buildDialStringWithOption(phone.e164, settings.prefix, usePrefix);

  try {
    const trunk = await resolveTrunk(sip, settings.trunkId);

    const sipRequest = {
      sipTrunkId: settings.trunkId,
      trunkName: trunk.name,
      gateway: trunk.address,
      sipCallTo: dialed,
      fromNumber: settings.callerId,
      roomName,
      participantIdentity,
      usePrefix,
      dialPrefix: usePrefix ? settings.prefix : "",
      playDialtone: false,
      ringingTimeout: 120,
      waitUntilAnswered: false,
    };

    try {
      await withTimeout(
        rooms.createRoom({
          name: roomName,
          emptyTimeout: 30 * 60,
          departureTimeout: 20,
          metadata: JSON.stringify({ to: phone.e164, dialed, usePrefix, gateway: trunk.address }),
        }),
        10000,
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: errorText(error, "Could not create LiveKit room."),
          sipRequest,
          dialed,
          usePrefix,
          gateway: trunk.address,
          trunkName: trunk.name,
          trunkId: settings.trunkId,
          liveKitHost: settings.host,
        },
        { status: 502 },
      );
    }

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
      await withTimeout(
        agents.createDispatch(roomName, PLACE_CALL_AMD_AGENT, {
          metadata: JSON.stringify({
            participantIdentity,
            sessionId: session.id,
          }),
        }),
        8000,
      );
      amd = true;
      await appendLiveKitEvent(roomName, "AGENT", "LiveKit AMD agent dispatched.");
    } catch (error) {
      const message = errorText(error, "AMD dispatch failed.");
      await appendLiveKitEvent(roomName, "AGENT", `AMD dispatch failed: ${message}. Desk will talk if answered.`);
    }

    let sipCallId: string | null = null;
    let sipHttpStatus = 200;
    let sipResponse: Record<string, unknown> = {};
    try {
      const created = await withTimeout(
        sip.createSipParticipant(settings.trunkId, dialed, roomName, {
          fromNumber: settings.callerId,
          participantIdentity,
          participantName: phone.display,
          playDialtone: false,
          ringingTimeout: 120,
          maxCallDuration: 30 * 60,
          waitUntilAnswered: false,
        }),
        15000,
      );
      sipCallId = created.sipCallId || null;
      sipResponse = {
        ok: true,
        sipCallId,
        participantId: created.participantId || null,
        participantIdentity: created.participantIdentity || participantIdentity,
        roomName: created.roomName || roomName,
        gateway: trunk.address,
        trunkName: trunk.name,
        note: "CreateSIPParticipant accepted. Gateway (UScare) result arrives as SIP status / disconnect reason while dialing.",
      };
      await appendLiveKitEvent(
        roomName,
        "DIAL",
        `Dialing ${dialed} via ${trunk.name ?? "trunk"} ${trunk.address ?? settings.trunkId} (sipCallId ${sipCallId ?? "n/a"}).`,
      );
    } catch (error) {
      const detail = sipErrorDetail(error);
      sipHttpStatus = "status" in (error as object) ? Number((error as { status?: unknown }).status) || 502 : 502;
      sipResponse = {
        ok: false,
        error: detail.message,
        sipStatusCode: detail.sipStatusCode,
        sipStatus: detail.sipStatus,
        gateway: trunk.address,
        trunkName: trunk.name,
      };
      await appendLiveKitEvent(roomName, "FAILED", detail.message);
      await rooms.deleteRoom(roomName).catch(() => undefined);
      return NextResponse.json(
        {
          error: detail.message,
          sipRequest,
          sipHttpStatus,
          sipResponse,
          dialed,
          usePrefix,
          gateway: trunk.address,
          trunkName: trunk.name,
          trunkId: settings.trunkId,
          liveKitHost: settings.host,
        },
        { status: 502 },
      );
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

    // Desk place-call always drops the spoken public/ WAVs (not seed beep tones).
    const voicemail = await findActiveMessage("VOICEMAIL").catch(() => null);
    const humanAnswer = await findActiveMessage("HUMAN_ANSWER").catch(() => null);

    return NextResponse.json({
      roomName,
      sessionId: session.id,
      amd,
      voicemailUrl: "/drop-voicemail.wav",
      voicemailName: voicemail?.name && !voicemail.isSeed ? voicemail.name : "public/drop-voicemail.wav",
      humanAnswerUrl: "/desk-human-answer.wav",
      humanAnswerName: humanAnswer?.name && !humanAnswer.isSeed ? humanAnswer.name : "public/desk-human-answer.wav",
      token: await token.toJwt(),
      url: settings.browserUrl,
      dialed,
      display: phone.display,
      callerId: settings.callerId,
      usePrefix,
      dialPrefix: usePrefix ? settings.prefix : "",
      trunkId: settings.trunkId,
      trunkName: trunk.name,
      gateway: trunk.address,
      sipCallId,
      sipRequest,
      sipHttpStatus,
      sipResponse,
      liveKitHost: settings.host,
    });
  } catch (error) {
    await rooms.deleteRoom(roomName).catch(() => undefined);
    return NextResponse.json(
      {
        error: errorText(error, "Could not place the call."),
        dialed,
        usePrefix,
        liveKitHost: settings.host,
      },
      { status: 502 },
    );
  }
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
      if (!(await missingPhoneMeansEnded(roomName))) {
        return NextResponse.json({ roomExists: true, status: "pending", phonePresent: false });
      }
      await noteSipStatus(roomName, "hangup", false);
      return NextResponse.json({ roomExists: false, status: "hangup", phonePresent: false });
    }
    const attributes = sipAttrs(phone.attributes as Record<string, string> | undefined);
    const status = attributes["sip.callStatus"] ?? "dialing";
    const disconnectReason = disconnectReasonLabel(phone.disconnectReason);
    await noteSipStatus(roomName, status, true);
    return NextResponse.json({
      roomExists: true,
      status,
      phonePresent: true,
      sipCallId: attributes["sip.callID"] ?? attributes["sip.callId"] ?? null,
      attributes,
      disconnectReason,
      participantIdentity: phone.identity,
    });
  } catch (error) {
    if (!roomIsGone(error)) return NextResponse.json({ roomExists: true, status: "pending", phonePresent: false });
    await noteSipStatus(roomName, "hangup", false);
    return NextResponse.json({ roomExists: false, status: "hangup", phonePresent: false });
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
