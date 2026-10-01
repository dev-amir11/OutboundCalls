import { describe, expect, it } from "vitest";
import { matchesLeadFilter, type LeadSnapshot } from "@/services/leads/lead-filter";

const now = new Date("2026-09-29T12:00:00.000Z");
const timeZone = "UTC";

function lead(overrides: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return {
    name: "John Smith",
    phone: "+1 206 555 0100",
    email: "john@example.com",
    company: "ABC Corp",
    createdAt: new Date("2026-09-29T08:00:00.000Z"),
    lastCallAt: null,
    lastCallStatus: null,
    activity: "NEW",
    callAttempts: 0,
    ...overrides,
  };
}

describe("lead filters", () => {
  it("matches imported today and yesterday", () => {
    const today = lead();
    const yesterday = lead({ createdAt: new Date("2026-09-28T15:00:00.000Z") });
    expect(matchesLeadFilter(today, { preset: "all", datePreset: "imported_today" }, now, timeZone)).toBe(true);
    expect(matchesLeadFilter(yesterday, { preset: "all", datePreset: "imported_today" }, now, timeZone)).toBe(false);
    expect(matchesLeadFilter(yesterday, { preset: "all", datePreset: "imported_yesterday" }, now, timeZone)).toBe(true);
  });

  it("matches failed yesterday, no answer, voicemail, and successful", () => {
    const failedYesterday = lead({
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      lastCallAt: new Date("2026-09-28T09:00:00.000Z"),
      lastCallStatus: "FAILED",
      callAttempts: 1,
      activity: "IDLE",
    });
    const noAnswer = lead({ lastCallStatus: "NO_ANSWER", callAttempts: 1, activity: "IDLE" });
    const voicemail = lead({
      lastCallAt: new Date("2026-09-28T10:00:00.000Z"),
      lastCallStatus: "VOICEMAIL",
      callAttempts: 1,
      activity: "IDLE",
    });
    const successful = lead({ lastCallStatus: "SUCCESSFUL", callAttempts: 1, activity: "IDLE" });

    expect(matchesLeadFilter(failedYesterday, { preset: "all", datePreset: "failed_yesterday" }, now, timeZone)).toBe(true);
    expect(matchesLeadFilter(successful, { preset: "all", datePreset: "failed_yesterday" }, now, timeZone)).toBe(false);
    expect(matchesLeadFilter(noAnswer, { preset: "no_answer" }, now, timeZone)).toBe(true);
    expect(matchesLeadFilter(voicemail, { preset: "all", datePreset: "voicemail_yesterday" }, now, timeZone)).toBe(true);
    expect(matchesLeadFilter(successful, { preset: "successful" }, now, timeZone)).toBe(true);
    expect(matchesLeadFilter(failedYesterday, { preset: "failed" }, now, timeZone)).toBe(true);
  });

  it("uses the configured timezone for today", () => {
    const lateUtc = new Date("2026-09-29T20:30:00.000Z");
    const imported = lead({ createdAt: lateUtc });
    expect(matchesLeadFilter(imported, { preset: "all", datePreset: "imported_today" }, lateUtc, "UTC")).toBe(true);
    expect(matchesLeadFilter(imported, { preset: "all", datePreset: "imported_today" }, lateUtc, "Asia/Karachi")).toBe(true);
    const previousLocalEvening = lead({ createdAt: new Date("2026-09-29T18:00:00.000Z") });
    expect(
      matchesLeadFilter(previousLocalEvening, { preset: "all", datePreset: "imported_yesterday" }, lateUtc, "Asia/Karachi"),
    ).toBe(true);
  });

  it("matches never called and in progress", () => {
    expect(matchesLeadFilter(lead(), { preset: "never_called" }, now, timeZone)).toBe(true);
    expect(matchesLeadFilter(lead({ callAttempts: 2, activity: "IDLE" }), { preset: "never_called" }, now, timeZone)).toBe(false);
    expect(matchesLeadFilter(lead({ activity: "IN_PROGRESS", callAttempts: 1 }), { preset: "in_progress" }, now, timeZone)).toBe(
      true,
    );
  });
});
