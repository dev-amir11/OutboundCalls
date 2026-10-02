import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendLiveKitEvent } from "@/services/livekit/session-log";

const KINDS = new Set(["JOINED", "VOICEMAIL", "HUNG_UP", "FAILED"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { sessionId?: unknown; kind?: unknown; message?: unknown } | null;
  const sessionId = String(body?.sessionId ?? "");
  const kind = String(body?.kind ?? "");
  const message = String(body?.message ?? "").slice(0, 240);
  if (!sessionId || !KINDS.has(kind) || !message) {
    return NextResponse.json({ error: "Unknown session event." }, { status: 400 });
  }

  const session = await prisma.liveKitSession.findFirst({
    where: { id: sessionId, createdById: user.id },
    select: { roomName: true },
  });
  if (!session) return NextResponse.json({ error: "Unknown session." }, { status: 404 });

  await appendLiveKitEvent(session.roomName, kind, message);
  return NextResponse.json({ ok: true });
}
