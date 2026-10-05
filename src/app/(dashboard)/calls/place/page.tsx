import { LiveCallPanel } from "@/components/live-call-panel";
import { PageHeader } from "@/components/page-header";
import { findActiveMessage } from "@/repositories/message-repository";

export const dynamic = "force-dynamic";

export default async function PlaceCallPage() {
  const [voicemail, humanAnswer] = await Promise.all([
    findActiveMessage("VOICEMAIL"),
    findActiveMessage("HUMAN_ANSWER"),
  ]);
  return (
    <div>
      <PageHeader
        title="Place a call"
        description="LiveKit AMD listens after answer. Human → active human-answer message is left, then hang up. Machine → active voicemail is left."
      />
      <LiveCallPanel
        voicemailName={voicemail?.name ?? null}
        humanAnswerName={humanAnswer?.name ?? null}
      />
    </div>
  );
}
