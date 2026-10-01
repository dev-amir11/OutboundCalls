import type { CallOutcome, ScheduledOutcome } from "@/services/calls/state-machine";

const WEIGHTS: { outcome: ScheduledOutcome; weight: number }[] = [
  { outcome: "ANSWERED", weight: 35 },
  { outcome: "VOICEMAIL", weight: 20 },
  { outcome: "NO_ANSWER", weight: 25 },
  { outcome: "BUSY", weight: 10 },
  { outcome: "FAILED", weight: 10 },
];

export function randomOutcome(rng: () => number = Math.random): ScheduledOutcome {
  const roll = rng() * 100;
  let cursor = 0;
  for (const item of WEIGHTS) {
    cursor += item.weight;
    if (roll < cursor) return item.outcome;
  }
  return "FAILED";
}

export type QueueCandidate = {
  campaignLeadId: string;
  leadId: string;
  attempts: number;
};

export function availableSlots(concurrency: number, inProgress: number) {
  if (!Number.isFinite(concurrency) || concurrency < 1) return 0;
  return Math.max(0, Math.floor(concurrency) - Math.max(0, inProgress));
}

export function pickQueuedLeads(
  pending: QueueCandidate[],
  activeLeadIds: ReadonlySet<string>,
  slots: number,
  maxAttempts: number,
) {
  const selected: QueueCandidate[] = [];
  const blockedAsActive: QueueCandidate[] = [];
  const claimed = new Set(activeLeadIds);
  if (slots <= 0) return { selected, blockedAsActive };

  for (const candidate of pending) {
    if (selected.length >= slots) break;
    if (candidate.attempts >= maxAttempts) continue;
    if (claimed.has(candidate.leadId)) {
      blockedAsActive.push(candidate);
      continue;
    }
    claimed.add(candidate.leadId);
    selected.push(candidate);
  }

  return { selected, blockedAsActive };
}

export class DuplicateActiveCallError extends Error {
  readonly leadId: string;

  constructor(leadId: string) {
    super("This lead already has an active call. A second call was not started.");
    this.name = "DuplicateActiveCallError";
    this.leadId = leadId;
  }
}

export function assertLeadAvailable(leadId: string, activeLeadIds: ReadonlySet<string>) {
  if (activeLeadIds.has(leadId)) throw new DuplicateActiveCallError(leadId);
}

export function shouldRetry(input: {
  outcome: CallOutcome;
  attempts: number;
  maxAttempts: number;
  retryNoAnswer: boolean;
  retryBusy: boolean;
  retryFailed: boolean;
}) {
  if (input.attempts >= input.maxAttempts) return false;
  if (input.outcome === "NO_ANSWER") return input.retryNoAnswer;
  if (input.outcome === "BUSY") return input.retryBusy;
  if (input.outcome === "FAILED") return input.retryFailed;
  return false;
}

export function mockStepMs() {
  const parsed = Number(process.env.MOCK_STEP_MS ?? 2000);
  if (!Number.isFinite(parsed) || parsed < 500) return 2000;
  return parsed;
}
