import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE } from "@/lib/constants";
import { leadFilterToWhere } from "@/services/leads/lead-filter-query";
import type { LeadFilter } from "@/services/leads/lead-filter";
import type { ValidLeadDraft } from "@/services/imports/validate-rows";

export async function countLeads(filter: LeadFilter) {
  return prisma.lead.count({ where: leadFilterToWhere(filter) });
}

export async function listLeads(filter: LeadFilter, page: number) {
  const where = leadFilterToWhere(filter);
  const skip = (page - 1) * PAGE_SIZE;
  const [total, leads] = await prisma.$transaction([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, leads, page, pageSize: PAGE_SIZE };
}

export async function findLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      import: { select: { fileName: true, createdAt: true, isSeed: true } },
      calls: {
        orderBy: { startedAt: "desc" },
        include: { campaign: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function findExistingPhones(phones: string[]) {
  if (!phones.length) return [];
  return prisma.lead.findMany({
    where: { phoneNormalized: { in: phones } },
    select: { phoneNormalized: true },
  });
}

export async function insertLeads(importId: string, rows: ValidLeadDraft[]) {
  return prisma.lead.createMany({
    data: rows.map((row) => ({
      name: row.name,
      phone: row.phone,
      phoneNormalized: row.phoneNormalized,
      email: row.email,
      company: row.company,
      notes: row.notes,
      extra: (row.extra ?? undefined) as Prisma.InputJsonValue | undefined,
      importId,
    })),
    skipDuplicates: true,
  });
}

export async function listLeadIds(filter: LeadFilter) {
  return prisma.lead.findMany({
    where: leadFilterToWhere(filter),
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
}
