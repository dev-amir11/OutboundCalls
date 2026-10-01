import type { AnswerType, CallLifecycleStatus, CallOutcome } from "@/services/calls/state-machine";

export type LiveKitSessionSnapshot = {
  status: CallLifecycleStatus;
  outcome: CallOutcome;
  answerType: AnswerType | null;
  terminal: boolean;
  message: string;
};

export function mapLiveKitSession(input: {
  roomExists: boolean;
  sipCallStatus: string | null;
  previouslyAnswered: boolean;
}): LiveKitSessionSnapshot {
  const sip = (input.sipCallStatus ?? "").trim().toLowerCase();

  if (!input.roomExists || sip === "hangup" || sip === "disconnected") {
    if (input.previouslyAnswered) {
      return {
        status: "COMPLETED",
        outcome: "SUCCESSFUL",
        answerType: "ANSWERED_HUMAN",
        terminal: true,
        message: "LiveKit closed the session after the call was answered.",
      };
    }
    return {
      status: "NO_ANSWER",
      outcome: "NO_ANSWER",
      answerType: "NO_ANSWER",
      terminal: true,
      message: "LiveKit closed the session before the call was answered.",
    };
  }

  if (sip === "error" || sip === "failed") {
    return {
      status: "FAILED",
      outcome: "FAILED",
      answerType: "FAILED",
      terminal: true,
      message: "LiveKit reported an error on the session.",
    };
  }

  if (sip === "active" || sip === "automation") {
    return {
      status: "ANSWERED_HUMAN",
      outcome: "IN_PROGRESS",
      answerType: "ANSWERED_HUMAN",
      terminal: false,
      message: "LiveKit session is active. The room remains the call session.",
    };
  }

  if (sip === "ringing") {
    return {
      status: "RINGING",
      outcome: "IN_PROGRESS",
      answerType: null,
      terminal: false,
      message: "Ringing. The LiveKit room is still the session.",
    };
  }

  return {
    status: "DIALING",
    outcome: "IN_PROGRESS",
    answerType: null,
    terminal: false,
    message: "Dialing through LiveKit. The room is the session.",
  };
}
