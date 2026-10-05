import { LiveCallPanel } from "@/components/live-call-panel";
import { PageHeader } from "@/components/page-header";
import { findActiveMessage } from "@/repositories/message-repository";

export const dynamic = "force-dynamic";

export default async function PlaceCallPage() {
  const voicemail = await findActiveMessage("VOICEMAIL");
  return (
    <div>
      <PageHeader
        title="Place a call"
        description="LiveKit AMD listens after answer. If a person picks up, you talk. If a machine picks up, the active voicemail is left."
      />
      <LiveCallPanel voicemailName={voicemail?.name ?? null} />
    </div>
  );
}
