import Link from "next/link";
import { notFound } from "next/navigation";
import { hangupCallAction } from "@/app/actions/calls";
import { getCallDetail } from "@/services/calls/call-service";
import { ConfirmForm } from "@/components/confirm-form";
import { PageHeader } from "@/components/page-header";
import { Poller } from "@/components/poller";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getProviderLabel } from "@/providers/telephony";
import { isTerminalStatus } from "@/services/calls/state-machine";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCallDetail(id);
  if (!call) notFound();
  const active = !isTerminalStatus(call.status);

  return (
    <div>
      {active ? <Poller /> : null}
      <PageHeader title={call.lead.name} description="Simulated call timeline. Provider events are labeled as mock." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge value="MOCK">{getProviderLabel(call.provider, call.isMock)}</Badge>
        {call.isSeed ? <Badge value="MOCK">Seed</Badge> : null}
        {active ? (
          <ConfirmForm
            action={hangupCallAction}
            label="Hang up"
            title="Hang up this mock call?"
            message="This cancels the simulation only."
            hidden={{ callId: call.id }}
            variant="danger"
          />
        ) : null}
      </div>
      <section className="rounded-xl border border-white/10 bg-[#161b24] p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Lead" value={call.lead.name} href={`/leads/${call.lead.id}`} />
          <Item label="Phone" value={call.phoneNumber} />
          <Item label="Campaign" value={call.campaign?.name ?? "—"} href={call.campaign ? `/campaigns/${call.campaign.id}` : undefined} />
          <Item label="Provider" value={getProviderLabel(call.provider, call.isMock)} />
          <Item label="Call ID" value={call.id} />
          <div>
            <dt className="text-zinc-400">Status</dt>
            <dd className="mt-1">
              <StatusBadge value={call.outcome === "IN_PROGRESS" ? call.status : call.outcome} />
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400">Answer type</dt>
            <dd className="mt-1">
              <StatusBadge value={call.answerType} />
            </dd>
          </div>
          <Item label="Started at" value={formatDateTime(call.startedAt)} />
          <Item label="Answered at" value={formatDateTime(call.answeredAt)} />
          <Item label="Ended at" value={formatDateTime(call.endedAt)} />
          <Item label="Duration" value={formatDuration(call.durationSeconds)} />
          <Item label="Human message" value={call.humanMessage?.name ?? "—"} />
          <Item label="Voicemail message" value={call.voicemailMessage?.name ?? "—"} />
        </dl>
        {call.errorMessage ? <p className="mt-4 text-sm text-rose-200">{call.errorMessage}</p> : null}
      </section>
      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Timeline</h2>
        <ol className="grid gap-2">
          {call.events.map((event) => (
            <li key={event.id} className="grid grid-cols-[9rem_1fr] gap-3 rounded-lg border border-white/10 bg-[#161b24] px-4 py-3 text-sm">
              <span className="tabular-nums text-zinc-400">{formatDateTime(event.createdAt)}</span>
              <span>
                <StatusBadge value={event.status} />
                <span className="ml-2">{event.message}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Item({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="mt-1 font-medium">
        {href ? (
          <Link href={href} className="underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
