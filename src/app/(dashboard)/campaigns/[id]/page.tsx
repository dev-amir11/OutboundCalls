import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelCampaignAction, pauseCampaignAction, resumeCampaignAction } from "@/app/actions/campaigns";
import { getCampaignDetail } from "@/services/campaigns/campaign-service";
import { describeLeadFilter, parseLeadFilter } from "@/services/leads/lead-filter";
import { ConfirmForm } from "@/components/confirm-form";
import { PageHeader } from "@/components/page-header";
import { Poller } from "@/components/poller";
import { StatusBadge } from "@/components/status-badge";
import { LiveDuration } from "@/components/live-duration";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getProviderLabel } from "@/providers/telephony";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaignDetail(id);
  if (!campaign) notFound();
  const stats = [
    ["Total leads", campaign.matchedCount],
    ["Queued", campaign.queued],
    ["In progress", campaign.inProgress],
    ["Completed", campaign.completedLeads],
    ["Successful", campaign.successful],
    ["Voicemail", campaign.voicemail],
    ["No answer", campaign.noAnswer],
    ["Busy", campaign.busy],
    ["Failed", campaign.failed],
  ] as const;

  return (
    <div>
      {campaign.status === "RUNNING" ? <Poller /> : null}
      <PageHeader
        title={campaign.name}
        description={`${describeLeadFilter(parseLeadFilter(campaign.filter))} · Concurrency ${campaign.concurrency} · Max attempts ${campaign.maxAttempts}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge value={campaign.status} />
        {campaign.isSeed ? <Badge value="MOCK">Seed</Badge> : null}
        <Badge value="MOCK">MOCK PROVIDER</Badge>
        {campaign.forcedOutcome ? <span className="text-sm text-zinc-400">Forced mock result: {campaign.forcedOutcome}</span> : null}
      </div>
      <div className="mb-6 max-w-xl">
        <div className="mb-1 flex justify-between text-sm">
          <span>Progress</span>
          <span className="tabular-nums">{campaign.progress}%</span>
        </div>
        <Progress value={campaign.progress} />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {campaign.status === "RUNNING" ? (
          <ConfirmForm action={pauseCampaignAction} label="Pause" title="Pause campaign?" message="In-progress simulated calls will finish. No new leads will be dialed until you resume." hidden={{ id: campaign.id }} />
        ) : null}
        {campaign.status === "PAUSED" ? (
          <ConfirmForm action={resumeCampaignAction} label="Resume" title="Resume campaign?" message="The mock queue will continue with the remaining leads." hidden={{ id: campaign.id }} />
        ) : null}
        {campaign.status === "RUNNING" || campaign.status === "PAUSED" || campaign.status === "QUEUED" ? (
          <ConfirmForm action={cancelCampaignAction} label="Cancel" title="Cancel campaign?" message="Pending leads will be skipped and active mock calls will be hung up." hidden={{ id: campaign.id }} variant="danger" />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#161b24] px-4 py-3">
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-zinc-400">
        Retry no answer: {campaign.retryNoAnswer ? "Yes" : "No"} · Retry busy: {campaign.retryBusy ? "Yes" : "No"} · Retry failed: {campaign.retryFailed ? "Yes" : "No"}
      </p>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Calls</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
          <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
            <thead className="border-b border-white/10 text-zinc-400">
              <tr>
                {["Lead", "Phone", "Status", "Started", "Duration", "Provider"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaign.calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    No calls have started for this campaign yet.
                  </td>
                </tr>
              ) : (
                campaign.calls.map((call) => (
                  <tr key={call.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/calls/${call.id}`} className="underline">
                        {call.lead.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{call.phoneNumber}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={call.outcome === "IN_PROGRESS" ? call.status : call.outcome} />
                    </td>
                    <td className="px-4 py-3">{formatDateTime(call.startedAt)}</td>
                    <td className="px-4 py-3">
                      {call.outcome === "IN_PROGRESS" ? (
                        <LiveDuration startedAt={call.startedAt?.toISOString() ?? null} />
                      ) : (
                        formatDuration(call.durationSeconds)
                      )}
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
