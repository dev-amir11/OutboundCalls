import { prisma } from "@/lib/prisma";
import { countActiveCalls, listActiveCalls, outcomeCounts } from "@/repositories/call-repository";

export async function getDashboardSnapshot() {
  const [totalLeads, readyToCall, activeCalls, outcomes, currentCalls] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({
      where: {
        activity: { not: "IN_PROGRESS" },
        OR: [{ lastCallStatus: null }, { lastCallStatus: { in: ["FAILED", "NO_ANSWER", "BUSY", "CANCELLED"] } }],
      },
    }),
    countActiveCalls(),
    outcomeCounts(),
    listActiveCalls(),
  ]);

  const byOutcome = Object.fromEntries(outcomes.map((row) => [row.outcome, row._count._all])) as Record<string, number>;

  return {
    totalLeads,
    readyToCall,
    activeCalls,
    successful: byOutcome.SUCCESSFUL ?? 0,
    voicemail: byOutcome.VOICEMAIL ?? 0,
    failed: byOutcome.FAILED ?? 0,
    noAnswer: byOutcome.NO_ANSWER ?? 0,
    busy: byOutcome.BUSY ?? 0,
    currentCalls,
  };
}
