import { MessageLibrary } from "@/components/message-library";

export default function HumanMessagesPage() {
  return (
    <MessageLibrary
      kind="HUMAN_ANSWER"
      title="Human answer messages"
      description="Played only after a simulated human answer. This is not the voicemail message."
    />
  );
}
