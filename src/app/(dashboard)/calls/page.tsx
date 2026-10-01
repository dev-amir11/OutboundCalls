import Link from "next/link";
import { hangupCallAction } from "@/app/actions/calls";
import { getCurrentCalls } from "@/services/calls/call-service";
import { ConfirmForm } from "@/components/confirm-form";
import { LiveDuration } from "@/components/live-duration";
import { PageHeader } from "@/components/page-header";
import { Poller } from "@/components/poller";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CurrentCallsPage() {
  const calls = await getCurrentCalls();
  return (
    <div>
      <Poller />
      <PageHeader title="Current calls" description="Active simulated calls. Status changes as the mock provider moves through the call lifecycle." />
      {calls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 bg-[#161b24] px-4 py-10 text-sm text-zinc-400">No calls are in progress.</p>
      ) : (
        <div className="grid gap-3">
          {calls.map((call) => (
            <article key={call.id} className="rounded-xl border border-white/10 bg-[#161b24] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    <Link href={`/leads/${call.lead.id}`} className="underline">
                      {call.lead.name}
                    </Link>
                  </h2>
                  <p className="mt-1 tabular-nums text-zinc-300">{call.lead.phone}</p>
                  <p className="mt-1 text-sm text-zinc-400">Campaign: {call.campaign?.name ?? "—"}</p>
                </div>
                <ConfirmForm
                  action={hangupCallAction}
                  label="Hang up"
                  title="Hang up this mock call?"
                  message="This cancels the simulation. It does not disconnect a real phone call."
                  hidden={{ callId: call.id }}
                  variant="danger"
                />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-zinc-400">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge value={call.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Started</dt>
                  <dd className="mt-1">{formatDateTime(call.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Duration</dt>
                  <dd className="mt-1">
                    <LiveDuration startedAt={call.startedAt?.toISOString() ?? null} />
                  </dd>
                </div>
              </dl>
              <Link href={`/calls/${call.id}`} className="mt-4 inline-block text-sm text-teal-300 underline">
                Call details
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
