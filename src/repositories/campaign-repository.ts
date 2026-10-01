import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ForcedOutcome } from "@/generated/prisma/client";

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { leads: true, calls: true } },
    },
  });
}

export async function findCampaign(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      humanMessage: { select: { id: true, name: true } },
      voicemailMessage: { select: { id: true, name: true } },
    },
  });
}

export async function campaignLeadCounts(campaignId?: string) {
  return prisma.campaignLead.groupBy({
    by: ["campaignId", "status"],
    where: campaignId ? { campaignId } : undefined,
    _count: { _all: true },
  });
}

export async function campaignCallCounts(campaignId?: string) {
  return prisma.call.groupBy({
    by: ["campaignId", "outcome"],
    where: campaignId ? { campaignId } : undefined,
    _count: { _all: true },
  });
}

export async function createRunningCampaign(input: {
  name: string;
  filter: Prisma.InputJsonValue;
  concurrency: number;
  maxAttempts: number;
  retryNoAnswer: boolean;
  retryBusy: boolean;
  retryFailed: boolean;
  forcedOutcome: ForcedOutcome | null;
  leadIds: string[];
  humanMessageId: string | null;
  voicemailMessageId: string | null;
}) {
  return prisma.campaign.create({
    data: {
      name: input.name,
      status: "RUNNING",
      filter: input.filter,
      concurrency: input.concurrency,
      maxAttempts: input.maxAttempts,
      retryNoAnswer: input.retryNoAnswer,
      retryBusy: input.retryBusy,
      retryFailed: input.retryFailed,
      forcedOutcome: input.forcedOutcome,
      matchedCount: input.leadIds.length,
      humanMessageId: input.humanMessageId,
      voicemailMessageId: input.voicemailMessageId,
      startedAt: new Date(),
      leads: {
        create: input.leadIds.map((leadId) => ({ leadId })),
      },
    },
  });
}

export async function updateCampaignStatus(
  id: string,
  data: Prisma.CampaignUpdateInput,
) {
  return prisma.campaign.update({ where: { id }, data });
}
