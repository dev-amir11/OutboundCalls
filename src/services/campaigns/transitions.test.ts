import { describe, expect, it } from "vitest";
import {
  campaignProgressPercent,
  isCampaignDispatching,
  transitionCampaign,
} from "@/services/campaigns/transitions";

describe("campaign lifecycle", () => {
  it("starts, pauses, resumes, completes, and cancels", () => {
    expect(transitionCampaign("DRAFT", "start")).toBe("RUNNING");
    expect(isCampaignDispatching("RUNNING")).toBe(true);

    expect(transitionCampaign("RUNNING", "pause")).toBe("PAUSED");
    expect(isCampaignDispatching("PAUSED")).toBe(false);

    expect(transitionCampaign("PAUSED", "resume")).toBe("RUNNING");
    expect(transitionCampaign("RUNNING", "complete")).toBe("COMPLETED");
    expect(isCampaignDispatching("COMPLETED")).toBe(false);

    expect(transitionCampaign("QUEUED", "start")).toBe("RUNNING");
    expect(transitionCampaign("RUNNING", "cancel")).toBe("CANCELLED");
    expect(transitionCampaign("PAUSED", "cancel")).toBe("CANCELLED");
    expect(transitionCampaign("DRAFT", "queue")).toBe("QUEUED");
    expect(transitionCampaign("RUNNING", "fail")).toBe("FAILED");
  });

  it("rejects illegal transitions", () => {
    expect(() => transitionCampaign("COMPLETED", "start")).toThrow(/cannot start/i);
    expect(() => transitionCampaign("CANCELLED", "pause")).toThrow(/cannot pause/i);
    expect(() => transitionCampaign("DRAFT", "pause")).toThrow(/cannot pause/i);
    expect(() => transitionCampaign("RUNNING", "resume")).toThrow(/cannot resume/i);
    expect(() => transitionCampaign("COMPLETED", "cancel")).toThrow(/cannot cancel/i);
  });

  it("calculates progress from remaining work", () => {
    expect(campaignProgressPercent({ matched: 100, pending: 20, inProgress: 12 })).toBe(68);
    expect(campaignProgressPercent({ matched: 0, pending: 0, inProgress: 0 })).toBe(0);
    expect(campaignProgressPercent({ matched: 4, pending: 0, inProgress: 0 })).toBe(100);
  });
});
