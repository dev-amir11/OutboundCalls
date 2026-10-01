import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageRefresh } from "@/components/page-refresh";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LiveKitSessionsPage() {
  const sessions = await prisma.liveKitSession.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { _count: { select: { events: true } } },
  });
  const live = sessions.some((session) => session.status === "DIALING" || session.status === "RINGING" || session.status === "TALKING");

  return (
    <div>
      {live ? <PageRefresh /> : null}
      <PageHeader
        title="LiveKit sessions"
        description="Each Place a Call attempt is a LiveKit room. Open a session to see when it started, when you joined, and when the phone answered."
      />
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
        <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 text-zinc-400">
            <tr>
              {["Phone", "Status", "Caller ID", "Started", "Answered", "Ended", "Events"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                  No LiveKit sessions yet. Place a call to start one.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/calls/livekit/${session.id}`} className="underline">
                      {session.phoneDisplay}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={session.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{session.callerId}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatDateTime(session.startedAt)}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatDateTime(session.answeredAt)}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatDateTime(session.endedAt)}</td>
                  <td className="px-4 py-3 text-zinc-300">{session._count.events}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
