import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE } from "@/lib/constants";
import { ACTIVE_CALL_STATUSES } from "@/services/calls/state-machine";

const activeStatuses = [...ACTIVE_CALL_STATUSES];

export async function listActiveCalls() {
  return prisma.call.findMany({
    where: { status: { in: activeStatuses } },
    include: {
      lead: { select: { id: true, name: true, phone: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: "asc" },
  });
}

export async function listCallHistory(where: Prisma.CallWhereInput, page: number) {
  const skip = (page - 1) * PAGE_SIZE;
  const [total, calls] = await prisma.$transaction([
    prisma.call.count({ where }),
    prisma.call.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, calls, page, pageSize: PAGE_SIZE };
}

export async function findCall(id: string) {
  return prisma.call.findUnique({
    where: { id },
    include: {
      lead: true,
      campaign: { select: { id: true, name: true, status: true } },
      humanMessage: { select: { id: true, name: true } },
      voicemailMessage: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function outcomeCounts() {
  return prisma.call.groupBy({
    by: ["outcome"],
    _count: { _all: true },
  });
}

export async function countActiveCalls() {
  return prisma.call.count({ where: { status: { in: activeStatuses } } });
}
