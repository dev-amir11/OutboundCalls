import { MessageLibrary } from "@/components/message-library";

export default function VoicemailMessagesPage() {
  return (
    <MessageLibrary
      kind="VOICEMAIL"
      title="Voicemail messages"
      description="Played only after a simulated answering machine, then the mock call hangs up."
    />
  );
}
