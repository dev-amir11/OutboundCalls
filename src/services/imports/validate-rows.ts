import type { ParsedLeadRow } from "@/services/imports/parse-spreadsheet";
import { normalizePhone } from "@/services/leads/phone";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type ValidLeadDraft = {
  rowNumber: number;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  extra: Record<string, string> | null;
};

export type InvalidLeadRow = {
  rowNumber: number;
  name: string;
  phone: string;
  reason: string;
};

export type DuplicateLeadRow = {
  rowNumber: number;
  name: string;
  phone: string;
  reason: "Duplicate in this file" | "Already imported";
};

export type ImportValidation = {
  valid: ValidLeadDraft[];
  invalid: InvalidLeadRow[];
  duplicates: DuplicateLeadRow[];
  summary: {
    totalRows: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
};

export function validateImportRows(rows: ParsedLeadRow[], existingPhones: ReadonlySet<string>): ImportValidation {
  const seen = new Set<string>();
  const valid: ValidLeadDraft[] = [];
  const invalid: InvalidLeadRow[] = [];
  const duplicates: DuplicateLeadRow[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const phoneRaw = row.phone.trim();
    if (!name) {
      invalid.push({ rowNumber: row.rowNumber, name, phone: phoneRaw, reason: "Name is required." });
      continue;
    }
    if (name.length > 200) {
      invalid.push({ rowNumber: row.rowNumber, name, phone: phoneRaw, reason: "Name must be 200 characters or fewer." });
      continue;
    }

    const phone = normalizePhone(phoneRaw);
    if (!phone.ok) {
      invalid.push({ rowNumber: row.rowNumber, name, phone: phoneRaw, reason: phone.reason });
      continue;
    }

    const email = row.email.trim();
    if (email && !isEmail(email)) {
      invalid.push({ rowNumber: row.rowNumber, name, phone: phone.display, reason: "Email is not valid." });
      continue;
    }

    if (seen.has(phone.e164)) {
      duplicates.push({
        rowNumber: row.rowNumber,
        name,
        phone: phone.display,
        reason: "Duplicate in this file",
      });
      continue;
    }
    if (existingPhones.has(phone.e164)) {
      duplicates.push({
        rowNumber: row.rowNumber,
        name,
        phone: phone.display,
        reason: "Already imported",
      });
      continue;
    }

    seen.add(phone.e164);
    valid.push({
      rowNumber: row.rowNumber,
      name,
      phone: phone.display,
      phoneNormalized: phone.e164,
      email: email || null,
      company: row.company.trim().slice(0, 200) || null,
      notes: row.notes.trim().slice(0, 5000) || null,
      extra: Object.keys(row.extra).length ? row.extra : null,
    });
  }

  return {
    valid,
    invalid,
    duplicates,
    summary: {
      totalRows: rows.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: duplicates.length,
    },
  };
}
