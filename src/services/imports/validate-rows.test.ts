import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ImportFileError, parseSpreadsheet } from "@/services/imports/parse-spreadsheet";
import { validateImportRows } from "@/services/imports/validate-rows";

function workbook(rows: unknown[][], bookType: "xlsx" | "csv" = "xlsx") {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Leads");
  return XLSX.write(book, { type: "buffer", bookType }) as Buffer;
}

const header = ["Name", "Phone", "Email", "Company", "Notes"];

describe("lead import", () => {
  it("accepts a valid workbook and keeps extra columns", () => {
    const data = workbook([
      [...header, "Region"],
      ["John Smith", "+12065550100", "john@example.com", "ABC Corp", "Existing customer", "West"],
      ["Jane Doe", "+1 (206) 555-0101", "jane@example.com", "XYZ Corp", "Follow up", "East"],
    ]);
    const parsed = parseSpreadsheet(data, "leads.xlsx");
    const result = validateImportRows(parsed.rows, new Set());
    expect(result.summary).toEqual({ totalRows: 2, valid: 2, invalid: 0, duplicates: 0 });
    expect(result.valid[0]).toMatchObject({
      name: "John Smith",
      phoneNormalized: "+12065550100",
      email: "john@example.com",
      company: "ABC Corp",
      extra: { Region: "West" },
    });
    expect(result.valid[1].phoneNormalized).toBe("+12065550101");
  });

  it("rejects an invalid excel file", () => {
    expect(() => parseSpreadsheet(Buffer.from("this is not a workbook"), "leads.xlsx")).toThrow(ImportFileError);
  });

  it("reports duplicate numbers inside the file and already imported numbers", () => {
    const data = workbook([
      header,
      ["John Smith", "+12065550100", "john@example.com", "ABC Corp", ""],
      ["John Again", "+1 206 555 0100", "john2@example.com", "ABC Corp", ""],
      ["Existing", "+12065550199", "existing@example.com", "ABC Corp", ""],
    ]);
    const parsed = parseSpreadsheet(data, "leads.csv");
    const result = validateImportRows(parsed.rows, new Set(["+12065550199"]));
    expect(result.summary).toMatchObject({ totalRows: 3, valid: 1, invalid: 0, duplicates: 2 });
    expect(result.duplicates.map((row) => row.reason)).toEqual(["Duplicate in this file", "Already imported"]);
  });

  it("reports a missing phone without dropping the other rows", () => {
    const data = workbook([
      header,
      ["No Phone", "", "none@example.com", "ABC Corp", ""],
      ["Jane Doe", "abc", "jane@example.com", "XYZ Corp", ""],
      ["Ok Lead", "+12065550102", "ok@example.com", "XYZ Corp", ""],
    ]);
    const result = validateImportRows(parseSpreadsheet(data, "leads.xlsx").rows, new Set());
    expect(result.summary).toMatchObject({ totalRows: 3, valid: 1, invalid: 2, duplicates: 0 });
    expect(result.invalid.map((row) => row.reason)).toEqual([
      "Phone is required.",
      "Phone number could not be normalized.",
    ]);
  });

  it("rejects an empty file and a header-only file", () => {
    expect(() => parseSpreadsheet(Buffer.alloc(0), "leads.xlsx")).toThrow(/empty/i);
    const headerOnly = workbook([header]);
    expect(() => parseSpreadsheet(headerOnly, "empty.xlsx")).toThrow(/no data rows/i);
  });
});
