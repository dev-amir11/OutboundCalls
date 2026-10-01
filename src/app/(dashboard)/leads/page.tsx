import Link from "next/link";
import { firstParam, formatDateTime } from "@/lib/format";
import { parsePage } from "@/lib/format";
import { parseLeadFilter } from "@/services/leads/lead-filter";
import { listLeads } from "@/repositories/lead-repository";
import { LeadFilterFields } from "@/components/lead-filter-fields";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination-controls";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = {
    q: firstParam(params.q),
    preset: firstParam(params.preset),
    datePreset: firstParam(params.datePreset),
    importFrom: firstParam(params.importFrom),
    importTo: firstParam(params.importTo),
    callFrom: firstParam(params.callFrom),
    callTo: firstParam(params.callTo),
  };
  const page = parsePage(params.page);
  const filter = parseLeadFilter(query);
  const result = await listLeads(filter, page);
  const imported = firstParam(params.imported);

  return (
    <div>
      <PageHeader title="All leads" description="Search, filter, and open a lead to see its call history." />
      {imported ? <p className="mb-4 rounded-md bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">Imported {imported} leads.</p> : null}
      <LeadFilterFields values={query} />
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
        <table className="w-full min-w-[980px] whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 text-zinc-400">
            <tr>
              {["Name", "Phone", "Email", "Import Date", "Last Call", "Call Attempts", "Last Call Status", "Current Status"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">
                  No leads match these filters.
                </td>
              </tr>
            ) : (
              result.leads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-teal-200 underline">
                      {lead.name}
                    </Link>
                    {lead.isSeed ? (
                      <Badge value="MOCK" className="ml-2">
                        Seed
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{lead.phone}</td>
                  <td className="px-4 py-3">{lead.email || "—"}</td>
                  <td className="px-4 py-3">{formatDateTime(lead.createdAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(lead.lastCallAt)}</td>
                  <td className="px-4 py-3 tabular-nums">{lead.callAttempts}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={lead.lastCallStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={lead.activity === "IN_PROGRESS" ? "IN_PROGRESS" : lead.activity} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Pagination page={result.page} total={result.total} pageSize={result.pageSize} basePath="/leads" params={query} />
      </div>
    </div>
  );
}
