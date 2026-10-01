import { LiveCallPanel } from "@/components/live-call-panel";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function PlaceCallPage() {
  return (
    <div>
      <PageHeader
        title="Place a call"
        description="Press Call to dial. You hear ringing until he answers, then you can talk to each other. No voicemail is played."
      />
      <LiveCallPanel />
    </div>
  );
}
