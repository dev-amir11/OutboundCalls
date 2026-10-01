import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PageRefresh } from "@/components/page-refresh";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LiveKitSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.liveKitSession.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();
  const live = session.status === "DIALING" || session.status === "RINGING" || session.status === "TALKING";

  return (
    <div>
      {live ? <PageRefresh /> : null}
      <PageHeader title={session.phoneDisplay} description="LiveKit room events for this call." />
      <section className="rounded-xl border border-white/10 bg-[#161b24] p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Status" value={<StatusBadge value={session.status} />} />
          <Item label="Phone" value={session.phoneE164} />
          <Item label="Caller ID" value={session.callerId} />
          <Item label="Dialed" value={session.dialed} />
          <Item label="Room" value={session.roomName} />
          <Item label="Started" value={formatDateTime(session.startedAt)} />
          <Item label="Answered" value={formatDateTime(session.answeredAt)} />
          <Item label="Ended" value={formatDateTime(session.endedAt)} />
        </dl>
        {session.detail ? <p className="mt-4 text-sm text-zinc-200">{session.detail}</p> : null}
        <p className="mt-4 text-sm text-zinc-400">
          <Link href="/calls/place" className="underline">
            Place a call
          </Link>
        </p>
      </section>
      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Events</h2>
        <ol className="grid gap-2">
          {session.events.map((event) => (
            <li key={event.id} className="grid gap-2 rounded-lg border border-white/10 bg-[#161b24] px-4 py-3 text-sm sm:grid-cols-[11rem_1fr]">
              <span className="tabular-nums text-zinc-400">{formatDateTime(event.createdAt)}</span>
              <span>
                <StatusBadge value={event.kind} />
                <span className="ml-2">{event.message}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
