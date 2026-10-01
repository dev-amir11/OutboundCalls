import { parseSpreadsheet } from "@/services/imports/parse-spreadsheet";
import { validateImportRows, type ImportValidation } from "@/services/imports/validate-rows";
import {
  createPreviewImport,
  findImport,
  markImportCompleted,
} from "@/repositories/import-repository";
import { findExistingPhones, insertLeads } from "@/repositories/lead-repository";

function asValidation(value: unknown): ImportValidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ImportValidation>;
  if (!record.summary || !Array.isArray(record.valid)) return null;
  return record as ImportValidation;
}

export async function stageImport(input: { fileName: string; data: Buffer; userId: string }) {
  if (input.data.length > 5 * 1024 * 1024) {
    throw new Error("The file is larger than 5 MB.");
  }
  const parsed = parseSpreadsheet(input.data, input.fileName);
  const preliminary = validateImportRows(parsed.rows, new Set());
  const existing = await findExistingPhones(preliminary.valid.map((row) => row.phoneNormalized));
  const validation = validateImportRows(parsed.rows, new Set(existing.map((row) => row.phoneNormalized)));
  return createPreviewImport({
    fileName: input.fileName,
    createdById: input.userId,
    validation,
  });
}

export async function readImportPreview(id: string) {
  const record = await findImport(id);
  if (!record) return null;
  return { record, validation: asValidation(record.preview) };
}

export async function confirmImport(id: string) {
  const record = await findImport(id);
  if (!record) throw new Error("Import not found.");
  if (record.status !== "PREVIEW") throw new Error("This import was already confirmed.");
  const validation = asValidation(record.preview);
  if (!validation) throw new Error("The import preview is missing.");
  if (!validation.valid.length) throw new Error("There are no valid leads to import.");

  const existing = await findExistingPhones(validation.valid.map((row) => row.phoneNormalized));
  const taken = new Set(existing.map((row) => row.phoneNormalized));
  const rows = validation.valid.filter((row) => !taken.has(row.phoneNormalized));
  const created = await insertLeads(record.id, rows);
  await markImportCompleted(record.id, created.count);
  return { imported: created.count, skipped: validation.valid.length - created.count };
}
