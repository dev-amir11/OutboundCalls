import type { MessageKind, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function listMessages(kind?: MessageKind) {
  return prisma.audioMessage.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

export async function findActiveMessage(kind: MessageKind) {
  return prisma.audioMessage.findFirst({
    where: { kind, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createMessage(data: Prisma.AudioMessageCreateInput) {
  return prisma.audioMessage.create({ data });
}

export async function activateMessage(id: string, kind: MessageKind) {
  return prisma.$transaction([
    prisma.audioMessage.updateMany({ where: { kind }, data: { isActive: false } }),
    prisma.audioMessage.update({ where: { id }, data: { isActive: true } }),
  ]);
}

export async function deleteMessage(id: string) {
  return prisma.audioMessage.delete({ where: { id } });
}

export async function findMessage(id: string) {
  return prisma.audioMessage.findUnique({ where: { id } });
}
