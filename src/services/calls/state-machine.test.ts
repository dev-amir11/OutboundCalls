import { describe, expect, it } from "vitest";
import { cancelTransition, nextCallState, walkCall } from "@/services/calls/state-machine";

const sequences = {
  ANSWERED: ["QUEUED", "DIALING", "RINGING", "ANSWERED_HUMAN", "PLAY_HUMAN_MESSAGE", "COMPLETED"],
  VOICEMAIL: ["QUEUED", "DIALING", "RINGING", "ANSWERING_MACHINE", "PLAY_VOICEMAIL", "COMPLETED"],
  NO_ANSWER: ["QUEUED", "DIALING", "RINGING", "NO_ANSWER"],
  BUSY: ["QUEUED", "DIALING", "RINGING", "BUSY"],
  FAILED: ["QUEUED", "DIALING", "RINGING", "FAILED"],
} as const;

describe("call state machine", () => {
  it.each(Object.entries(sequences))("walks %s to the expected states", (outcome, expected) => {
    const walked = walkCall(outcome as keyof typeof sequences, {
      human: "Human Answer Message",
      voicemail: "Voicemail Message",
    });
    expect(walked.states).toEqual(expected);
  });

  it("plays the human answer message only after a human answers", () => {
    const walked = walkCall("ANSWERED", { human: "September greeting" });
    const play = walked.events.find((event) => event.status === "PLAY_HUMAN_MESSAGE");
    expect(play?.playAudio).toBe("human");
    expect(play?.eventMessage).toContain("September greeting");
    expect(walked.events.at(-1)).toMatchObject({ status: "COMPLETED", outcome: "SUCCESSFUL", terminal: true });
  });

  it("plays the voicemail message only after an answering machine", () => {
    const walked = walkCall("VOICEMAIL", { voicemail: "Leave a message" });
    const play = walked.events.find((event) => event.status === "PLAY_VOICEMAIL");
    expect(play?.playAudio).toBe("voicemail");
    expect(play?.eventMessage).toContain("Leave a message");
    expect(walked.events.at(-1)).toMatchObject({ status: "COMPLETED", outcome: "VOICEMAIL" });
  });

  it("ends no-answer, busy, and failed without playback", () => {
    for (const outcome of ["NO_ANSWER", "BUSY", "FAILED"] as const) {
      const walked = walkCall(outcome);
      expect(walked.events.some((event) => event.playAudio)).toBe(false);
      expect(walked.events.at(-1)?.status).toBe(outcome);
      expect(walked.events.at(-1)?.terminal).toBe(true);
    }
  });

  it("does not advance terminal states", () => {
    for (const status of ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELLED"] as const) {
      expect(nextCallState({ status, scheduledOutcome: "ANSWERED" })).toBeNull();
    }
  });

  it("cancels an active call", () => {
    expect(cancelTransition()).toMatchObject({
      status: "CANCELLED",
      outcome: "CANCELLED",
      terminal: true,
    });
  });
});
