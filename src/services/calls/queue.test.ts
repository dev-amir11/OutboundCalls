import { describe, expect, it } from "vitest";
import {
  availableSlots,
  DuplicateActiveCallError,
  assertLeadAvailable,
  pickQueuedLeads,
  shouldRetry,
} from "@/services/calls/queue";
import { nextCallState, type CallLifecycleStatus, type ScheduledOutcome } from "@/services/calls/state-machine";

describe("calling queue", () => {
  it("limits concurrency", () => {
    expect(availableSlots(10, 3)).toBe(7);
    expect(availableSlots(10, 10)).toBe(0);
    expect(availableSlots(5, 0)).toBe(5);
    expect(availableSlots(0, 0)).toBe(0);
  });

  it("does not select a lead that already has an active call", () => {
    const pending = [
      { campaignLeadId: "1", leadId: "lead-a", attempts: 0 },
      { campaignLeadId: "2", leadId: "lead-b", attempts: 0 },
    ];
    const { selected, blockedAsActive } = pickQueuedLeads(pending, new Set(["lead-a"]), 5, 3);
    expect(selected.map((item) => item.leadId)).toEqual(["lead-b"]);
    expect(blockedAsActive.map((item) => item.leadId)).toEqual(["lead-a"]);
    expect(() => assertLeadAvailable("lead-a", new Set(["lead-a"]))).toThrow(DuplicateActiveCallError);
  });

  it("does not select the same lead twice and respects max attempts", () => {
    const pending = [
      { campaignLeadId: "1", leadId: "lead-a", attempts: 0 },
      { campaignLeadId: "2", leadId: "lead-a", attempts: 0 },
      { campaignLeadId: "3", leadId: "lead-b", attempts: 2 },
      { campaignLeadId: "4", leadId: "lead-c", attempts: 0 },
    ];
    const { selected } = pickQueuedLeads(pending, new Set(), 10, 2);
    expect(selected.map((item) => item.leadId)).toEqual(["lead-a", "lead-c"]);
  });

  it("processes the queue to completion, retries eligible calls, and keeps concurrency", () => {
    const leads = ["a", "b", "c", "d"].map((id) => ({
      id,
      attempts: 0,
      status: "PENDING" as "PENDING" | "IN_PROGRESS" | "COMPLETED",
    }));
    const outcomes: Record<string, ScheduledOutcome> = {
      a: "FAILED",
      b: "NO_ANSWER",
      c: "ANSWERED",
      d: "BUSY",
    };
    const policy = {
      maxAttempts: 2,
      retryNoAnswer: true,
      retryBusy: false,
      retryFailed: false,
      concurrency: 2,
    };
    let active: { leadId: string; lifecycle: CallLifecycleStatus; scheduled: ScheduledOutcome }[] = [];
    let highWater = 0;

    for (let guard = 0; guard < 80 && (leads.some((lead) => lead.status !== "COMPLETED") || active.length); guard += 1) {
      const still: typeof active = [];
      for (const call of active) {
        const next = nextCallState({ status: call.lifecycle, scheduledOutcome: call.scheduled });
        if (!next || next.terminal) {
          const lead = leads.find((item) => item.id === call.leadId)!;
          const outcome = next?.outcome ?? "FAILED";
          lead.status = shouldRetry({
            outcome,
            attempts: lead.attempts,
            maxAttempts: policy.maxAttempts,
            retryNoAnswer: policy.retryNoAnswer,
            retryBusy: policy.retryBusy,
            retryFailed: policy.retryFailed,
          })
            ? "PENDING"
            : "COMPLETED";
        } else {
          still.push({ ...call, lifecycle: next.status });
        }
      }
      active = still;
      const pending = leads
        .filter((lead) => lead.status === "PENDING")
        .map((lead) => ({ campaignLeadId: lead.id, leadId: lead.id, attempts: lead.attempts }));
      const slots = availableSlots(policy.concurrency, active.length);
      const { selected } = pickQueuedLeads(pending, new Set(active.map((call) => call.leadId)), slots, policy.maxAttempts);
      expect(active.length + selected.length).toBeLessThanOrEqual(policy.concurrency);
      for (const item of selected) {
        const lead = leads.find((entry) => entry.id === item.leadId)!;
        lead.attempts += 1;
        lead.status = "IN_PROGRESS";
        active.push({ leadId: lead.id, lifecycle: "QUEUED", scheduled: outcomes[lead.id] });
      }
      highWater = Math.max(highWater, active.length);
      expect(new Set(active.map((call) => call.leadId)).size).toBe(active.length);
    }

    expect(highWater).toBeLessThanOrEqual(2);
    expect(highWater).toBe(2);
    expect(leads.every((lead) => lead.status === "COMPLETED")).toBe(true);
    expect(leads.find((lead) => lead.id === "b")?.attempts).toBe(2);
    expect(leads.find((lead) => lead.id === "a")?.attempts).toBe(1);
    expect(leads.find((lead) => lead.id === "d")?.attempts).toBe(1);
    expect(leads.find((lead) => lead.id === "c")?.attempts).toBe(1);
  });

  it("retries only the configured outcomes and stops at max attempts", () => {
    const policy = { maxAttempts: 2, retryNoAnswer: true, retryBusy: true, retryFailed: false };
    expect(shouldRetry({ outcome: "NO_ANSWER", attempts: 1, ...policy })).toBe(true);
    expect(shouldRetry({ outcome: "BUSY", attempts: 1, ...policy })).toBe(true);
    expect(shouldRetry({ outcome: "FAILED", attempts: 1, ...policy })).toBe(false);
    expect(shouldRetry({ outcome: "SUCCESSFUL", attempts: 1, ...policy })).toBe(false);
    expect(shouldRetry({ outcome: "VOICEMAIL", attempts: 1, ...policy })).toBe(false);
    expect(shouldRetry({ outcome: "CANCELLED", attempts: 1, ...policy })).toBe(false);
    expect(shouldRetry({ outcome: "NO_ANSWER", attempts: 2, ...policy })).toBe(false);
  });
});
