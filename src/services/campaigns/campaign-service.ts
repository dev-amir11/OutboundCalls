import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  campaignCallCounts,
  campaignLeadCounts,
  createRunningCampaign,
  findCampaign,
  listCampaigns,
  updateCampaignStatus,
} from "@/repositories/campaign-repository";
import { listLeadIds } from "@/repositories/lead-repository";
import { findActiveMessage } from "@/repositories/message-repository";
import { tickCallingQueue, hangupCall } from "@/services/calls/call-service";
import { campaignProgressPercent, isCampaignDispatching, transitionCampaign } from "@/services/campaigns/transitions";
import { describeLeadFilter, type LeadFilter } from "@/services/leads/lead-filter";

export async function previewCampaignMatch(filter: LeadFilter) {
  const leads = await listLeadIds(filter);
  return { total: leads.length, description: describeLeadFilter(filter) };
}

export async function startCampaign(input: {
  name: string;
  filter: LeadFilter;
  concurrency: number;
  maxAttempts: number;
  retryNoAnswer: boolean;
  retryBusy: boolean;
  retryFailed: boolean;
  forcedOutcome: "ANSWERED" | "VOICEMAIL" | "NO_ANSWER" | "BUSY" | "FAILED" | null;
}) {
  const leads = await listLeadIds(input.filter);
  if (!leads.length) throw new Error("No leads matched this filter.");
  const [human, voicemail] = await Promise.all([
    findActiveMessage("HUMAN_ANSWER"),
    findActiveMessage("VOICEMAIL"),
  ]);
  const campaign = await createRunningCampaign({
    name: input.name,
    filter: input.filter as unknown as Prisma.InputJsonValue,
    concurrency: input.concurrency,
    maxAttempts: input.maxAttempts,
    retryNoAnswer: input.retryNoAnswer,
    retryBusy: input.retryBusy,
    retryFailed: input.retryFailed,
    forcedOutcome: input.forcedOutcome,
    leadIds: leads.map((lead) => lead.id),
    humanMessageId: human?.id ?? null,
    voicemailMessageId: voicemail?.id ?? null,
  });
  await tickCallingQueue();
  return campaign;
}

export async function pauseCampaign(id: string) {
  const campaign = await requireCampaign(id);
  const status = transitionCampaign(campaign.status, "pause");
  return updateCampaignStatus(id, { status, pausedAt: new Date() });
}

export async function resumeCampaign(id: string) {
  const campaign = await requireCampaign(id);
  const status = transitionCampaign(campaign.status, "resume");
  const updated = await updateCampaignStatus(id, { status, pausedAt: null });
  await tickCallingQueue();
  return updated;
}

export async function cancelCampaign(id: string) {
  const campaign = await requireCampaign(id);
  const status = transitionCampaign(campaign.status, "cancel");
  await updateCampaignStatus(id, { status, completedAt: new Date() });
  await prisma.campaignLead.updateMany({
    where: { campaignId: id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  const active = await prisma.call.findMany({
    where: { campaignId: id, activeLeadKey: { not: null } },
    select: { id: true },
  });
  for (const call of active) {
    await hangupCall(call.id);
  }
}

async function requireCampaign(id: string) {
  const campaign = await findCampaign(id);
  if (!campaign) throw new Error("Campaign not found.");
  return campaign;
}

export async function getCampaignList() {
  const [campaigns, leadCounts, callCounts] = await Promise.all([
    listCampaigns(),
    campaignLeadCounts(),
    campaignCallCounts(),
  ]);
  return campaigns.map((campaign) => decorate(campaign, leadCounts, callCounts));
}

export async function getCampaignDetail(id: string) {
  const campaign = await findCampaign(id);
  if (!campaign) return null;
  const [leadCounts, callCounts, calls] = await Promise.all([
    campaignLeadCounts(id),
    campaignCallCounts(id),
    prisma.call.findMany({
      where: { campaignId: id },
      include: { lead: { select: { id: true, name: true, phone: true } } },
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
  ]);
  return { ...decorate(campaign, leadCounts, callCounts), calls, dispatching: isCampaignDispatching(campaign.status) };
}

function decorate<T extends { id: string; matchedCount: number }>(
  campaign: T,
  leadCounts: { campaignId: string | null; status: string; _count: { _all: number } }[],
  callCounts: { campaignId: string | null; outcome: string; _count: { _all: number } }[],
) {
  const leads = leadCounts.filter((row) => row.campaignId === campaign.id);
  const calls = callCounts.filter((row) => row.campaignId === campaign.id);
  const countLead = (status: string) => leads.find((row) => row.status === status)?._count._all ?? 0;
  const countCall = (outcome: string) => calls.find((row) => row.outcome === outcome)?._count._all ?? 0;
  const pending = countLead("PENDING");
  const inProgress = countLead("IN_PROGRESS");
  return {
    ...campaign,
    queued: pending,
    inProgress,
    completedLeads: countLead("COMPLETED") + countLead("SKIPPED") + countLead("CANCELLED"),
    successful: countCall("SUCCESSFUL"),
    voicemail: countCall("VOICEMAIL"),
    noAnswer: countCall("NO_ANSWER"),
    busy: countCall("BUSY"),
    failed: countCall("FAILED"),
    progress: campaignProgressPercent({ matched: campaign.matchedCount, pending, inProgress }),
  };
}
