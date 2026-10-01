import Link from "next/link";
import { ANSWER_TYPE_OPTIONS, CALL_DATE_PRESETS, OUTCOME_OPTIONS } from "@/lib/constants";
import { firstParam, formatDateTime, formatDuration, parsePage } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { searchCallHistory } from "@/services/calls/call-service";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination-controls";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderLabel } from "@/providers/telephony";

export const dynamic = "force-dynamic";

export default async function CallHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = {
    q: firstParam(params.q),
    datePreset: firstParam(params.datePreset),
    from: firstParam(params.from),
    to: firstParam(params.to),
    campaignId: firstParam(params.campaignId),
    outcome: firstParam(params.outcome),
    answerType: firstParam(params.answerType),
  };
  const page = parsePage(params.page);
  const [result, campaigns] = await Promise.all([
    searchCallHistory(query, page),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Call history" description="Completed and in-progress simulated calls. Filter by date, campaign, status, or answer type." />
      <form className="mb-4 grid gap-3 rounded-xl border border-white/10 bg-[#161b24] p-4 md:grid-cols-3 xl:grid-cols-4">
        <label className="grid gap-1 text-sm">
          Search
          <input name="q" defaultValue={query.q} placeholder="Lead or phone" className="h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 text-zinc-100 placeholder:text-zinc-500" />
        </label>
        <Select name="datePreset" label="Date" defaultValue={query.datePreset || ""} options={CALL_DATE_PRESETS.map((item) => ({ value: item.value, label: item.label }))} />
        <label className="grid gap-1 text-sm">
          From
          <input type="date" name="from" defaultValue={query.from} className="h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 text-zinc-100" />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <input type="date" name="to" defaultValue={query.to} className="h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 text-zinc-100" />
        </label>
        <Select
          name="campaignId"
          label="Campaign"
          defaultValue={query.campaignId || ""}
          options={[{ value: "", label: "Any campaign" }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]}
        />
        <Select name="outcome" label="Status" defaultValue={query.outcome || ""} options={OUTCOME_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} />
        <Select name="answerType" label="Answer type" defaultValue={query.answerType || ""} options={ANSWER_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} />
        <div className="flex items-end">
          <Button type="submit">Apply</Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
        <table className="w-full min-w-[980px] whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 text-zinc-400">
            <tr>
              {["Lead", "Phone", "Campaign", "Status", "Answer Type", "Duration", "Started At", "Ended At", "Provider"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.calls.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
                  No calls match these filters.
                </td>
              </tr>
            ) : (
              result.calls.map((call) => (
                <tr key={call.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/calls/${call.id}`} className="font-medium underline">
                      {call.lead.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{call.phoneNumber}</td>
                  <td className="px-4 py-3">{call.campaign ? <Link href={`/campaigns/${call.campaign.id}`}>{call.campaign.name}</Link> : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={call.outcome === "IN_PROGRESS" ? "IN_PROGRESS" : call.outcome} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={call.answerType} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDuration(call.durationSeconds)}</td>
                  <td className="px-4 py-3">{formatDateTime(call.startedAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(call.endedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge value="MOCK">{getProviderLabel(call.provider, call.isMock)}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Pagination page={result.page} total={result.total} pageSize={result.pageSize} basePath="/calls/history" params={query} />
      </div>
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select name={name} defaultValue={defaultValue} className="h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 text-zinc-100">
        {options.map((option) => (
          <option key={`${name}-${option.value || "any"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
