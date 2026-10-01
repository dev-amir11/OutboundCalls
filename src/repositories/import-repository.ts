import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ImportValidation } from "@/services/imports/validate-rows";

export async function createPreviewImport(input: {
  fileName: string;
  createdById: string;
  validation: ImportValidation;
}) {
  return prisma.leadImport.create({
    data: {
      fileName: input.fileName,
      status: "PREVIEW",
      totalRows: input.validation.summary.totalRows,
      validRows: input.validation.summary.valid,
      invalidRows: input.validation.summary.invalid,
      duplicateRows: input.validation.summary.duplicates,
      preview: input.validation as unknown as Prisma.InputJsonValue,
      createdById: input.createdById,
    },
  });
}

export async function findImport(id: string) {
  return prisma.leadImport.findUnique({ where: { id } });
}

export async function listImports() {
  return prisma.leadImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function markImportCompleted(id: string, importedRows: number) {
  return prisma.leadImport.update({
    where: { id },
    data: { status: "COMPLETED", importedRows },
  });
}
