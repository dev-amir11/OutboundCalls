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
        description="If someone picks up, you talk. If the phone rings for about 20 seconds and the mailbox answers, the active voicemail is left for them."
      />
      <LiveCallPanel voicemailName={voicemail?.name ?? null} />
    </div>
  );
}
