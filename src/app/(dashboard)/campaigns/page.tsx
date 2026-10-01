import Link from "next/link";
import { getCampaignList } from "@/services/campaigns/campaign-service";
import { describeLeadFilter, parseLeadFilter } from "@/services/leads/lead-filter";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await getCampaignList();
  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Each bulk calling run is a campaign. Mock campaigns simulate outcomes and never dial a carrier."
        action={
          <Button asChild>
            <Link href="/campaigns/new">Create campaign</Link>
          </Button>
        }
      />
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
        <table className="w-full min-w-[860px] whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 text-zinc-400">
            <tr>
              {["Campaign", "Filter", "Matched", "Concurrency", "Progress", "Status"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  No campaigns yet.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${campaign.id}`} className="font-medium text-teal-200 underline">
                      {campaign.name}
                    </Link>
                    {campaign.isSeed ? (
                      <Badge value="MOCK" className="ml-2">
                        Seed
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{describeLeadFilter(parseLeadFilter(campaign.filter))}</td>
                  <td className="px-4 py-3 tabular-nums">{campaign.matchedCount}</td>
                  <td className="px-4 py-3 tabular-nums">{campaign.concurrency}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Progress value={campaign.progress} />
                      <span className="w-10 tabular-nums">{campaign.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={campaign.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
