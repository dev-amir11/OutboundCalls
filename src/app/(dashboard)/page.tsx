import Link from "next/link";
import { getDashboardSnapshot } from "@/services/dashboard/stats";
import { PageHeader } from "@/components/page-header";
import { Poller } from "@/components/poller";
import { StatusBadge } from "@/components/status-badge";
import { LiveDuration } from "@/components/live-duration";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { getProviderLabel } from "@/providers/telephony";

export const dynamic = "force-dynamic";

const cards = [
  { key: "totalLeads", label: "Total Leads", accent: "text-zinc-50" },
  { key: "readyToCall", label: "Ready to Call", accent: "text-sky-300" },
  { key: "activeCalls", label: "Calls In Progress", accent: "text-indigo-300" },
  { key: "successful", label: "Successful Calls", accent: "text-emerald-300" },
  { key: "voicemail", label: "Voicemail Calls", accent: "text-sky-300" },
  { key: "failed", label: "Failed Calls", accent: "text-rose-300" },
  { key: "noAnswer", label: "No Answer", accent: "text-amber-200" },
  { key: "busy", label: "Busy", accent: "text-orange-200" },
] as const;

export default async function DashboardPage() {
  const stats = await getDashboardSnapshot();
  return (
    <div>
      <Poller />
      <PageHeader
        title="Dashboard"
        description="Ready to call means the lead is not in progress and the last result was not a successful conversation or voicemail."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-xl border border-white/10 bg-[#161b24] px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold tabular-nums ${card.accent}`}>{stats[card.key]}</p>
          </div>
        ))}
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Current calls</h2>
          <Link href="/calls" className="text-sm text-teal-300 underline">
            Open current calls
          </Link>
        </div>
        <CallsTable calls={stats.currentCalls} />
      </section>
    </div>
  );
}

function CallsTable({
  calls,
}: {
  calls: Awaited<ReturnType<typeof getDashboardSnapshot>>["currentCalls"];
}) {
  if (!calls.length) {
    return <p className="rounded-xl border border-dashed border-white/15 bg-[#161b24] px-4 py-8 text-sm text-zinc-400">No calls are in progress.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
      <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
        <thead className="border-b border-white/10 text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Lead</th>
            <th className="px-4 py-3 font-medium">Phone Number</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Started At</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Call Type</th>
            <th className="px-4 py-3 font-medium">Provider</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-3">
                <Link href={`/calls/${call.id}`} className="font-medium text-teal-200 underline">
                  {call.lead.name}
                </Link>
              </td>
              <td className="px-4 py-3 tabular-nums">{call.phoneNumber}</td>
              <td className="px-4 py-3">
                <StatusBadge value={call.status} />
              </td>
              <td className="px-4 py-3">{formatDateTime(call.startedAt)}</td>
              <td className="px-4 py-3">
                <LiveDuration startedAt={call.startedAt?.toISOString() ?? null} />
              </td>
              <td className="px-4 py-3">{call.answerType ? <StatusBadge value={call.answerType} /> : "—"}</td>
              <td className="px-4 py-3">
                <Badge value="MOCK">{getProviderLabel(call.provider, call.isMock)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
