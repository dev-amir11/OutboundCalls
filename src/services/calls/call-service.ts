import { prisma } from "@/lib/prisma";
import { getLiveKitCallController } from "@/providers/livekit/livekit-call-controller";
import { LiveKitTelephonyProvider } from "@/providers/livekit/livekit-telephony-provider";
import { getTelephonyProvider } from "@/providers/telephony";
import { MockTelephonyProvider } from "@/providers/telephony/mock/mock-telephony-provider";
import { getGlobalForcedOutcome } from "@/repositories/settings-repository";
import { findCall, listActiveCalls, listCallHistory } from "@/repositories/call-repository";
import { parseCallHistoryFilter, resolveCallWindow, type CallHistoryFilter } from "@/services/calls/history-filter";
import {
  DuplicateActiveCallError,
  availableSlots,
  mockStepMs,
  pickQueuedLeads,
  randomOutcome,
  shouldRetry,
} from "@/services/calls/queue";
import {
  ACTIVE_CALL_STATUSES,
  cancelTransition,
  isTerminalStatus,
  nextCallState,
  type CallLifecycleStatus,
  type ScheduledOutcome,
} from "@/services/calls/state-machine";
import { isCampaignDispatching } from "@/services/campaigns/transitions";
import type { Campaign, ForcedOutcome, Prisma } from "@/generated/prisma/client";

const activeStatuses = [...ACTIVE_CALL_STATUSES];

export async function tickCallingQueue(now = new Date()) {
  const step = mockStepMs();
  await advanceDueCalls(now, step);
  await dispatchRunningCampaigns(now);
  await syncLiveKitSessions(now);
  await completeFinishedCampaigns(now);
}

export async function getCurrentCalls() {
  return listActiveCalls();
}

export async function getCallDetail(id: string) {
  return findCall(id);
}

export async function searchCallHistory(input: unknown, page: number) {
  const filter = parseCallHistoryFilter(input);
  return listCallHistory(historyWhere(filter) as Prisma.CallWhereInput, page);
}

export function historyWhere(filter: CallHistoryFilter) {
  const and: Record<string, unknown>[] = [];
  if (filter.search) {
    and.push({
      OR: [
        { phoneNumber: { contains: filter.search, mode: "insensitive" } },
        { lead: { name: { contains: filter.search, mode: "insensitive" } } },
      ],
    });
  }
  if (filter.campaignId) and.push({ campaignId: filter.campaignId });
  if (filter.outcome) and.push({ outcome: filter.outcome });
  if (filter.answerType) and.push({ answerType: filter.answerType });
  const window = resolveCallWindow(filter);
  if (window) and.push({ startedAt: window });
  return and.length ? { AND: and } : {};
}

export async function hangupCall(callId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { campaign: true },
  });
  if (!call) throw new Error("Call not found.");
  if (isTerminalStatus(call.status)) throw new Error("This call has already ended.");

  const provider = getTelephonyProvider();
  if (call.providerCallId) {
    await provider.hangupCall(call.providerCallId).catch(() => undefined);
  }
  const transition = cancelTransition();
  const endedAt = new Date();
  await persistTerminal(call, transition, endedAt);
}

async function advanceDueCalls(now: Date, step: number) {
  const due = await prisma.call.findMany({
    where: {
      isMock: true,
      status: { in: activeStatuses },
      nextTransitionAt: { lte: now },
    },
    include: {
      humanMessage: { select: { name: true } },
      voicemailMessage: { select: { name: true } },
      campaign: true,
    },
    orderBy: { nextTransitionAt: "asc" },
    take: 200,
  });

  for (const call of due) {
    await advanceMockCall(call, now, step);
  }
}

type DueCall = Prisma.CallGetPayload<{
  include: {
    humanMessage: { select: { name: true } };
    voicemailMessage: { select: { name: true } };
    campaign: true;
  };
}>;

async function advanceMockCall(call: DueCall, now: Date, step: number) {
  if (!call.scheduledOutcome || !call.nextTransitionAt) return;
  let status: CallLifecycleStatus = call.status;
  let outcome = call.outcome;
  let answerType = call.answerType;
  let answeredAt = call.answeredAt;
  let cursor: Date | null = call.nextTransitionAt;
  const events: ReturnType<typeof nextCallState>[] = [];
  const eventTimes: Date[] = [];

  while (cursor && cursor.getTime() <= now.getTime()) {
    const next = nextCallState({
      status,
      scheduledOutcome: call.scheduledOutcome,
      humanMessageName: call.humanMessage?.name,
      voicemailMessageName: call.voicemailMessage?.name,
    });
    if (!next) break;
    events.push(next);
    eventTimes.push(cursor);
    status = next.status;
    outcome = next.outcome;
    if (next.answerType) answerType = next.answerType;
    if (next.answered) answeredAt = cursor;
    if (next.terminal) {
      cursor = null;
      break;
    }
    cursor = new Date(cursor.getTime() + step);
  }

  const planned = events.filter((event): event is NonNullable<typeof event> => Boolean(event));
  if (!planned.length) return;
  const last = planned[planned.length - 1];
  const lastAt = eventTimes[eventTimes.length - 1];
  const answeredIndex = planned.findIndex((event) => event.answered);
  const liveKit = answeredIndex >= 0 ? await getLiveKitCallController().attachAgent({ callId: call.id, providerCallId: call.providerCallId }) : null;

  const provider = getTelephonyProvider();
  if (provider instanceof MockTelephonyProvider && call.providerCallId) {
    for (const event of planned) {
      if (event.playAudio && !liveKit?.attached) {
        const messageId = event.playAudio === "human" ? call.humanMessageId : call.voicemailMessageId;
        await provider.playAudio(call.providerCallId, messageId ? `/api/audio/${messageId}` : "");
      }
      provider.remember(call.providerCallId, event.status);
    }
    if (last.terminal) await provider.hangupCall(call.providerCallId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.call.update({
      where: { id: call.id },
      data: {
        status,
        outcome,
        answerType,
        answeredAt,
        endedAt: last.terminal ? lastAt : null,
        durationSeconds:
          last.terminal && call.startedAt ? Math.max(0, Math.round((lastAt.getTime() - call.startedAt.getTime()) / 1000)) : null,
        activeLeadKey: last.terminal ? null : call.leadId,
        nextTransitionAt: cursor,
        errorCode: status === "FAILED" ? "MOCK_FAILED" : null,
        errorMessage: status === "FAILED" ? "Simulated failure from the mock provider." : null,
      },
    });
    await tx.callEvent.createMany({
      data: [
        ...planned.map((event, index) => ({
          callId: call.id,
          status: event.status,
          message: event.eventMessage,
          createdAt: eventTimes[index],
        })),
        ...(liveKit && answeredIndex >= 0
          ? [
              {
                callId: call.id,
                status: planned[answeredIndex].status,
                message: liveKit.attached
                  ? "LiveKit agent joined the answered call."
                  : `LiveKit checked on answer. ${liveKit.reason} The saved message plays through the telephony provider.`,
                createdAt: eventTimes[answeredIndex],
              },
            ]
          : []),
      ],
    });
    if (last.terminal) {
      await finishLeadAndCampaign(tx, call, outcome, lastAt);
    }
  });
}

async function persistTerminal(
  call: { id: string; leadId: string; campaignId: string | null; campaign: Campaign | null; startedAt: Date | null },
  transition: NonNullable<ReturnType<typeof cancelTransition>>,
  endedAt: Date,
) {
  await prisma.$transaction(async (tx) => {
    await tx.call.update({
      where: { id: call.id },
      data: {
        status: transition.status,
        outcome: transition.outcome,
        endedAt,
        durationSeconds: call.startedAt ? Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)) : 0,
        activeLeadKey: null,
        nextTransitionAt: null,
      },
    });
    await tx.callEvent.create({
      data: { callId: call.id, status: transition.status, message: transition.eventMessage, createdAt: endedAt },
    });
    await finishLeadAndCampaign(tx, call, transition.outcome, endedAt);
  });
}

async function finishLeadAndCampaign(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  call: { id: string; leadId: string; campaignId: string | null; campaign: Campaign | null },
  outcome: "SUCCESSFUL" | "VOICEMAIL" | "NO_ANSWER" | "BUSY" | "FAILED" | "IN_PROGRESS" | "CANCELLED",
  at: Date,
) {
  await tx.lead.update({
    where: { id: call.leadId },
    data: { activity: "IDLE", lastCallAt: at, lastCallStatus: outcome },
  });
  if (!call.campaignId || !call.campaign) return;
  const campaignLead = await tx.campaignLead.findUnique({
    where: { campaignId_leadId: { campaignId: call.campaignId, leadId: call.leadId } },
  });
  if (!campaignLead) return;
  const retry =
    call.campaign.status !== "CANCELLED" &&
    call.campaign.status !== "COMPLETED" &&
    shouldRetry({
      outcome,
      attempts: campaignLead.attempts,
      maxAttempts: call.campaign.maxAttempts,
      retryNoAnswer: call.campaign.retryNoAnswer,
      retryBusy: call.campaign.retryBusy,
      retryFailed: call.campaign.retryFailed,
    });
  await tx.campaignLead.update({
    where: { id: campaignLead.id },
    data: {
      status: retry ? "PENDING" : outcome === "CANCELLED" ? "CANCELLED" : "COMPLETED",
      lastOutcome: outcome,
    },
  });
}

async function syncLiveKitSessions(now: Date) {
  const provider = getTelephonyProvider();
  if (!(provider instanceof LiveKitTelephonyProvider)) return;
  const calls = await prisma.call.findMany({
    where: { provider: "livekit", isMock: false, activeLeadKey: { not: null } },
    include: { campaign: true },
  });
  for (const call of calls) {
    if (!call.providerCallId) continue;
    try {
      const previouslyAnswered = Boolean(call.answeredAt) || call.status === "ANSWERED_HUMAN";
      const snapshot = await provider.readSession(call.providerCallId, previouslyAnswered);
      if (snapshot.status === call.status && !snapshot.terminal) continue;
      await prisma.$transaction(async (tx) => {
        await tx.call.update({
          where: { id: call.id },
          data: {
            status: snapshot.status,
            outcome: snapshot.outcome,
            answerType: snapshot.answerType ?? call.answerType,
            answeredAt: snapshot.status === "ANSWERED_HUMAN" ? (call.answeredAt ?? now) : call.answeredAt,
            endedAt: snapshot.terminal ? now : null,
            durationSeconds: snapshot.terminal && call.startedAt ? Math.max(0, Math.round((now.getTime() - call.startedAt.getTime()) / 1000)) : call.durationSeconds,
            activeLeadKey: snapshot.terminal ? null : call.leadId,
            errorCode: snapshot.status === "FAILED" ? "LIVEKIT_SESSION" : null,
            errorMessage: snapshot.status === "FAILED" ? snapshot.message : null,
          },
        });
        if (snapshot.status !== call.status) {
          await tx.callEvent.create({
            data: { callId: call.id, status: snapshot.status, message: snapshot.message, createdAt: now },
          });
        }
        if (snapshot.terminal) await finishLeadAndCampaign(tx, call, snapshot.outcome, now);
      });
    } catch {
      // The next poll reads the LiveKit room again. A missing room is already a terminal snapshot.
    }
  }
}

async function dispatchRunningCampaigns(now: Date) {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "asc" },
  });
  if (!campaigns.length) return;
  const globalForced = await getGlobalForcedOutcome();
  const active = await prisma.call.findMany({
    where: { activeLeadKey: { not: null } },
    select: { leadId: true },
  });
  const activeIds = new Set(active.map((call) => call.leadId));

  for (const campaign of campaigns) {
    if (!isCampaignDispatching(campaign.status)) continue;
    const inProgress = await prisma.call.count({
      where: { campaignId: campaign.id, activeLeadKey: { not: null } },
    });
    const slots = availableSlots(campaign.concurrency, inProgress);
    if (!slots) continue;
    const pending = await prisma.campaignLead.findMany({
      where: { campaignId: campaign.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: slots * 5,
    });
    const { selected } = pickQueuedLeads(
      pending.map((row) => ({ campaignLeadId: row.id, leadId: row.leadId, attempts: row.attempts })),
      activeIds,
      slots,
      campaign.maxAttempts,
    );
    for (const item of selected) {
      const started = await startOneCall(campaign, item.leadId, now, globalForced);
      if (started) activeIds.add(item.leadId);
    }
  }
}

async function startOneCall(
  campaign: Campaign,
  leadId: string,
  now: Date,
  globalForced: ScheduledOutcome | null,
) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return false;
  const resolvedOutcome: ScheduledOutcome =
    (campaign.forcedOutcome as ScheduledOutcome | null) ?? globalForced ?? randomOutcome();
  const provider = getTelephonyProvider();
  const callId = crypto.randomUUID();
  const mockProvider = provider instanceof MockTelephonyProvider ? provider : null;
  let providerCallId: string | null = null;
  let isMock = provider.name === "mock";
  if (mockProvider) {
    const initiated = await mockProvider.initiateCall({
      clientCallId: callId,
      to: lead.phoneNormalized,
      forcedOutcome: resolvedOutcome,
      metadata: { leadId, campaignId: campaign.id },
    });
    providerCallId = initiated.providerCallId;
    isMock = initiated.isMock;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const active = await tx.call.findFirst({ where: { leadId, activeLeadKey: { not: null } } });
      if (active) throw new DuplicateActiveCallError(leadId);
      await tx.call.create({
        data: {
          id: callId,
          leadId,
          campaignId: campaign.id,
          provider: provider.name,
          providerCallId,
          status: "QUEUED",
          outcome: "IN_PROGRESS",
          phoneNumber: lead.phoneNormalized,
          startedAt: now,
          humanMessageId: campaign.humanMessageId,
          voicemailMessageId: campaign.voicemailMessageId,
          scheduledOutcome: isMock ? (resolvedOutcome as ForcedOutcome) : null,
          nextTransitionAt: isMock ? new Date(now.getTime() + mockStepMs()) : null,
          isMock,
          activeLeadKey: leadId,
        },
      });
      await tx.callEvent.create({
        data: {
          callId,
          status: "QUEUED",
          message: isMock ? "Queued for dialing (simulated, MOCK PROVIDER)" : "Opening a LiveKit room. That room is the call session.",
          createdAt: now,
        },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { activity: "IN_PROGRESS", callAttempts: { increment: 1 } },
      });
      await tx.campaignLead.update({
        where: { campaignId_leadId: { campaignId: campaign.id, leadId } },
        data: { status: "IN_PROGRESS", attempts: { increment: 1 } },
      });
    });
  } catch (error) {
    if (providerCallId) await provider.hangupCall(providerCallId).catch(() => undefined);
    if (error instanceof DuplicateActiveCallError) return false;
    throw error;
  }

  if (!mockProvider) {
    try {
      const initiated = await provider.initiateCall({
        clientCallId: callId,
        to: lead.phoneNormalized,
        metadata: { leadId, campaignId: campaign.id },
      });
      await prisma.call.update({
        where: { id: callId },
        data: {
          providerCallId: initiated.providerCallId,
          isMock: initiated.isMock,
          provider: provider.name,
          status: "DIALING",
        },
      });
      await prisma.callEvent.create({
        data: {
          callId,
          status: "DIALING",
          message: `LiveKit room ${initiated.providerCallId} is the session. LiveKit is dialing ${lead.phoneNormalized} through the Telnyx SIP trunk.`,
          createdAt: now,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The telephony provider could not start the call.";
      await prisma.call.update({
        where: { id: callId },
        data: {
          status: "FAILED",
          outcome: "FAILED",
          answerType: "FAILED",
          endedAt: now,
          activeLeadKey: null,
          nextTransitionAt: null,
          errorCode: "PROVIDER_ERROR",
          errorMessage: message,
        },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { activity: "IDLE", lastCallAt: now, lastCallStatus: "FAILED" },
      });
      await prisma.campaignLead.update({
        where: { campaignId_leadId: { campaignId: campaign.id, leadId } },
        data: { status: "COMPLETED", lastOutcome: "FAILED" },
      });
    }
  }

  return true;
}

async function completeFinishedCampaigns(now: Date) {
  const running = await prisma.campaign.findMany({ where: { status: "RUNNING" }, select: { id: true } });
  for (const campaign of running) {
    const open = await prisma.campaignLead.count({
      where: { campaignId: campaign.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });
    if (open === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "COMPLETED", completedAt: now },
      });
    }
  }
}
