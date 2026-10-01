import type { ScheduledOutcome } from "@/services/calls/state-machine";
import { prisma } from "@/lib/prisma";

const FORCED_OUTCOME_KEY = "mock.forcedOutcome";

export async function getGlobalForcedOutcome(): Promise<ScheduledOutcome | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: FORCED_OUTCOME_KEY } });
  if (!row || typeof row.value !== "object" || row.value === null || Array.isArray(row.value)) return null;
  const outcome = "outcome" in row.value ? row.value.outcome : null;
  if (outcome === "ANSWERED" || outcome === "VOICEMAIL" || outcome === "NO_ANSWER" || outcome === "BUSY" || outcome === "FAILED") {
    return outcome;
  }
  return null;
}

export async function setGlobalForcedOutcome(outcome: ScheduledOutcome | null) {
  const value = { outcome: outcome ?? "RANDOM" };
  return prisma.systemSetting.upsert({
    where: { key: FORCED_OUTCOME_KEY },
    create: { key: FORCED_OUTCOME_KEY, value },
    update: { value },
  });
}
