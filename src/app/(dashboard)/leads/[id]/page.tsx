import Link from "next/link";
import { notFound } from "next/navigation";
import { findLead } from "@/repositories/lead-repository";
import { formatDateTime, formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { getProviderLabel } from "@/providers/telephony";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await findLead(id);
  if (!lead) notFound();
  const extra = lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra) ? lead.extra : null;
  const tally = (outcome: string) => lead.calls.filter((call) => call.outcome === outcome).length;

  return (
    <div>
      <PageHeader title={lead.name} description={lead.isSeed ? "Seeded sample lead. Calls shown here are simulated." : "Lead record and call history."} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#161b24] p-5">
          <h2 className="font-semibold">Lead information</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Item label="Name" value={lead.name} />
            <Item label="Phone" value={lead.phone} />
            <Item label="Email" value={lead.email || "—"} />
            <Item label="Company" value={lead.company || "—"} />
            <div className="col-span-2">
              <Item label="Notes" value={lead.notes || "—"} />
            </div>
            {extra
              ? Object.entries(extra).map(([key, value]) => <Item key={key} label={key} value={String(value ?? "—")} />)
              : null}
          </dl>
        </section>
        <section className="rounded-xl border border-white/10 bg-[#161b24] p-5">
          <h2 className="font-semibold">Call statistics</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Item label="Total attempts" value={String(lead.callAttempts)} />
            <Item label="Successful calls" value={String(tally("SUCCESSFUL"))} />
            <Item label="Voicemail calls" value={String(tally("VOICEMAIL"))} />
            <Item label="Failed calls" value={String(tally("FAILED"))} />
            <Item label="No answer" value={String(tally("NO_ANSWER"))} />
            <Item label="Busy" value={String(tally("BUSY"))} />
          </dl>
        </section>
      </div>
      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Call history</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
          <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
            <thead className="border-b border-white/10 text-zinc-400">
              <tr>
                {["Date/Time", "Attempt", "Status", "Duration", "Call Type", "Provider"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lead.calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    This lead has not been called.
                  </td>
                </tr>
              ) : (
                lead.calls.map((call, index) => (
                  <tr key={call.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/calls/${call.id}`} className="underline">
                        {formatDateTime(call.startedAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{lead.calls.length - index}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={call.outcome === "IN_PROGRESS" ? call.status : call.outcome} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatDuration(call.durationSeconds)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={call.answerType} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge value="MOCK">{getProviderLabel(call.provider, call.isMock)}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
