export const CALL_LIFECYCLE = [
  "QUEUED",
  "DIALING",
  "RINGING",
  "ANSWERED_HUMAN",
  "PLAY_HUMAN_MESSAGE",
  "ANSWERING_MACHINE",
  "PLAY_VOICEMAIL",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type CallLifecycleStatus = (typeof CALL_LIFECYCLE)[number];

export const ACTIVE_CALL_STATUSES = [
  "QUEUED",
  "DIALING",
  "RINGING",
  "ANSWERED_HUMAN",
  "PLAY_HUMAN_MESSAGE",
  "ANSWERING_MACHINE",
  "PLAY_VOICEMAIL",
] as const satisfies readonly CallLifecycleStatus[];

export type ScheduledOutcome = "ANSWERED" | "VOICEMAIL" | "NO_ANSWER" | "BUSY" | "FAILED";

export type CallOutcome =
  | "SUCCESSFUL"
  | "VOICEMAIL"
  | "NO_ANSWER"
  | "BUSY"
  | "FAILED"
  | "IN_PROGRESS"
  | "CANCELLED";

export type AnswerType = "ANSWERED_HUMAN" | "ANSWERING_MACHINE" | "NO_ANSWER" | "BUSY" | "FAILED";

export type CallTransition = {
  status: CallLifecycleStatus;
  outcome: CallOutcome;
  answerType: AnswerType | null;
  eventMessage: string;
  playAudio: "human" | "voicemail" | null;
  terminal: boolean;
  answered: boolean;
};

export function isTerminalStatus(status: CallLifecycleStatus) {
  return !ACTIVE_CALL_STATUSES.includes(status as (typeof ACTIVE_CALL_STATUSES)[number]);
}

export function nextCallState(input: {
  status: CallLifecycleStatus;
  scheduledOutcome: ScheduledOutcome;
  humanMessageName?: string | null;
  voicemailMessageName?: string | null;
}): CallTransition | null {
  if (isTerminalStatus(input.status)) return null;

  if (input.status === "QUEUED") return inProgress("DIALING", "Dialing (simulated)");
  if (input.status === "DIALING") return inProgress("RINGING", "Ringing (simulated)");

  if (input.status === "RINGING") {
    switch (input.scheduledOutcome) {
      case "ANSWERED":
        return {
          status: "ANSWERED_HUMAN",
          outcome: "IN_PROGRESS",
          answerType: "ANSWERED_HUMAN",
          eventMessage: "Answered by a human (simulated)",
          playAudio: null,
          terminal: false,
          answered: true,
        };
      case "VOICEMAIL":
        return {
          status: "ANSWERING_MACHINE",
          outcome: "IN_PROGRESS",
          answerType: "ANSWERING_MACHINE",
          eventMessage: "Answering machine detected (simulated)",
          playAudio: null,
          terminal: false,
          answered: true,
        };
      case "NO_ANSWER":
        return terminal("NO_ANSWER", "NO_ANSWER", "NO_ANSWER", "No answer (simulated)");
      case "BUSY":
        return terminal("BUSY", "BUSY", "BUSY", "Busy (simulated)");
      case "FAILED":
        return terminal("FAILED", "FAILED", "FAILED", "Call failed (simulated)");
    }
  }

  if (input.status === "ANSWERED_HUMAN") {
    const name = input.humanMessageName?.trim() || "No human answer message configured";
    return {
      status: "PLAY_HUMAN_MESSAGE",
      outcome: "IN_PROGRESS",
      answerType: "ANSWERED_HUMAN",
      eventMessage: `Human answer message played: ${name}`,
      playAudio: "human",
      terminal: false,
      answered: false,
    };
  }

  if (input.status === "PLAY_HUMAN_MESSAGE") {
    return terminal("COMPLETED", "SUCCESSFUL", "ANSWERED_HUMAN", "Call completed (simulated)");
  }

  if (input.status === "ANSWERING_MACHINE") {
    const name = input.voicemailMessageName?.trim() || "No voicemail message configured";
    return {
      status: "PLAY_VOICEMAIL",
      outcome: "IN_PROGRESS",
      answerType: "ANSWERING_MACHINE",
      eventMessage: `Voicemail message played: ${name}`,
      playAudio: "voicemail",
      terminal: false,
      answered: false,
    };
  }

  if (input.status === "PLAY_VOICEMAIL") {
    return terminal("COMPLETED", "VOICEMAIL", "ANSWERING_MACHINE", "Call completed after voicemail (simulated)");
  }

  return null;
}

export function cancelTransition(): CallTransition {
  return {
    status: "CANCELLED",
    outcome: "CANCELLED",
    answerType: null,
    eventMessage: "Call cancelled by administrator (simulated)",
    playAudio: null,
    terminal: true,
    answered: false,
  };
}

function inProgress(status: CallLifecycleStatus, eventMessage: string): CallTransition {
  return {
    status,
    outcome: "IN_PROGRESS",
    answerType: null,
    eventMessage,
    playAudio: null,
    terminal: false,
    answered: false,
  };
}

function terminal(
  status: CallLifecycleStatus,
  outcome: CallOutcome,
  answerType: AnswerType,
  eventMessage: string,
): CallTransition {
  return {
    status,
    outcome,
    answerType,
    eventMessage,
    playAudio: null,
    terminal: true,
    answered: false,
  };
}

export function walkCall(scheduledOutcome: ScheduledOutcome, names?: { human?: string; voicemail?: string }) {
  const states: CallLifecycleStatus[] = ["QUEUED"];
  let status: CallLifecycleStatus = "QUEUED";
  const events: CallTransition[] = [];
  for (let guard = 0; guard < 12; guard += 1) {
    const next = nextCallState({
      status,
      scheduledOutcome,
      humanMessageName: names?.human,
      voicemailMessageName: names?.voicemail,
    });
    if (!next) break;
    events.push(next);
    states.push(next.status);
    status = next.status;
    if (next.terminal) break;
  }
  return { states, events };
}
