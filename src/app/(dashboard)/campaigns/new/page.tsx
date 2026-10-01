import { CampaignForm } from "@/components/campaign-form";
import { PageHeader } from "@/components/page-header";

export default function NewCampaignPage() {
  return (
    <div>
      <PageHeader
        title="Create campaign"
        description="Choose a filter, calculate the matching leads, set concurrency, then confirm. Calls stay on the mock provider."
      />
      <CampaignForm />
    </div>
  );
}
