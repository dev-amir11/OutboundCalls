export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type CampaignCommand = "queue" | "start" | "pause" | "resume" | "cancel" | "complete" | "fail";

const TRANSITIONS: Record<CampaignCommand, { from: CampaignStatus[]; to: CampaignStatus }> = {
  queue: { from: ["DRAFT"], to: "QUEUED" },
  start: { from: ["DRAFT", "QUEUED", "PAUSED"], to: "RUNNING" },
  pause: { from: ["RUNNING"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "RUNNING" },
  cancel: { from: ["DRAFT", "QUEUED", "RUNNING", "PAUSED"], to: "CANCELLED" },
  complete: { from: ["RUNNING", "PAUSED", "QUEUED"], to: "COMPLETED" },
  fail: { from: ["DRAFT", "QUEUED", "RUNNING", "PAUSED"], to: "FAILED" },
};

export class CampaignTransitionError extends Error {
  constructor(status: CampaignStatus, command: CampaignCommand) {
    super(`Cannot ${command} a campaign that is ${status.toLowerCase()}.`);
    this.name = "CampaignTransitionError";
  }
}

export function transitionCampaign(status: CampaignStatus, command: CampaignCommand) {
  const rule = TRANSITIONS[command];
  if (!rule.from.includes(status)) throw new CampaignTransitionError(status, command);
  return rule.to;
}

export function isCampaignDispatching(status: CampaignStatus) {
  return status === "RUNNING";
}

export function campaignProgressPercent(input: { matched: number; pending: number; inProgress: number }) {
  if (input.matched <= 0) return 0;
  const done = input.matched - input.pending - input.inProgress;
  return Math.max(0, Math.min(100, Math.round((done / input.matched) * 100)));
}
