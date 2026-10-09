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
        description="Dial with or without DIAL_PREFIX through the UScare SIP trunk. The live log shows the dial request, CreateSIPParticipant response, gateway address, and SIP disconnect reason (for example USER_REJECTED)."
      />
      <LiveCallPanel
        voicemailName={voicemail && !voicemail.isSeed ? voicemail.name : "public/drop-voicemail.wav"}
        humanAnswerName={humanAnswer && !humanAnswer.isSeed ? humanAnswer.name : "public/desk-human-answer.wav"}
      />
    </div>
  );
}
