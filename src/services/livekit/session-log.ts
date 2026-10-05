import type { LiveKitDeskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const STATUS_BY_KIND: Record<string, LiveKitDeskStatus | null> = {
  STARTED: "DIALING",
  DIALING: "DIALING",
  JOINED: null,
  AGENT: null,
  RINGING: "RINGING",
  ANSWERED: "TALKING",
  AMD: null,
  VOICEMAIL: null,
  HUNG_UP: "ENDED",
  FAILED: "FAILED",
};

export async function startLiveKitSession(input: {
  userId: string;
  roomName: string;
  phoneDisplay: string;
  phoneE164: string;
  callerId: string;
  dialed: string;
}) {
  return prisma.liveKitSession.create({
    data: {
      roomName: input.roomName,
      phoneDisplay: input.phoneDisplay,
      phoneE164: input.phoneE164,
      callerId: input.callerId,
      dialed: input.dialed,
      status: "DIALING",
      detail: `Dialing ${input.phoneDisplay}`,
      createdById: input.userId,
      events: {
        create: [
          { kind: "STARTED", message: "Call started" },
          { kind: "DIALING", message: `Dialing ${input.phoneDisplay}. Caller ID ${input.callerId}.` },
        ],
      },
    },
  });
}

export async function appendLiveKitEvent(roomName: string, kind: string, message: string) {
  const session = await prisma.liveKitSession.findUnique({ where: { roomName } });
  if (!session || session.endedAt) return;

  const allowRepeat = kind === "AMD" || kind === "VOICEMAIL";
  if (!allowRepeat) {
    const existing = await prisma.liveKitSessionEvent.findFirst({
      where: { sessionId: session.id, kind },
    });
    if (existing) return;
  }

  const status = STATUS_BY_KIND[kind];
  const now = new Date();
  await prisma.liveKitSession.update({
    where: { id: session.id },
    data: {
      ...(status ? { status } : {}),
      detail: message,
      answeredAt: kind === "ANSWERED" || kind === "AMD" ? (session.answeredAt ?? now) : undefined,
      endedAt: kind === "HUNG_UP" || kind === "FAILED" ? now : undefined,
      events: { create: { kind, message } },
    },
  });
}

export async function missingPhoneMeansEnded(roomName: string) {
  const session = await prisma.liveKitSession.findUnique({
    where: { roomName },
    select: { status: true, startedAt: true, endedAt: true },
  });
  if (!session || session.endedAt) return true;
  if (session.status === "RINGING" || session.status === "TALKING") return true;
  return Date.now() - session.startedAt.getTime() > 8000;
}

export async function noteSipStatus(roomName: string, sipStatus: string, roomExists: boolean) {
  if (!roomExists || sipStatus === "hangup" || sipStatus === "disconnected") {
    await appendLiveKitEvent(roomName, "HUNG_UP", "The other side hung up.");
    return;
  }
  if (sipStatus === "ringing") {
    await appendLiveKitEvent(roomName, "RINGING", "Phone is ringing.");
    return;
  }
  if (sipStatus === "active" || sipStatus === "automation") {
    await appendLiveKitEvent(roomName, "ANSWERED", "Call answered. Waiting for LiveKit AMD.");
  }
}
