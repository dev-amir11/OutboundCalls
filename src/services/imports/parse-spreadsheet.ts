import * as XLSX from "xlsx";

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

export type ParsedLeadRow = {
  rowNumber: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
  extra: Record<string, string>;
};

const HEADER_ALIASES: Record<string, "name" | "phone" | "email" | "company" | "notes"> = {
  name: "name",
  "full name": "name",
  fullname: "name",
  contact: "name",
  phone: "phone",
  "phone number": "phone",
  phonenumber: "phone",
  mobile: "phone",
  tel: "phone",
  telephone: "phone",
  email: "email",
  "e-mail": "email",
  company: "company",
  organization: "company",
  organisation: "company",
  org: "company",
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",
};

export function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function assertFileKind(data: Buffer, extension: string) {
  if (extension === "xlsx") {
    const isZip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
    if (!isZip) throw new ImportFileError("The file could not be parsed. Check that it is a valid .xlsx workbook.");
  }
  if (extension === "xls") {
    const isOle = data.length >= 4 && data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0;
    if (!isOle) throw new ImportFileError("The file could not be parsed. Check that it is a valid .xls workbook.");
  }
}

export function parseSpreadsheet(data: Buffer, fileName: string) {
  if (!data.length) throw new ImportFileError("The file is empty.");
  const extension = extensionOf(fileName);
  if (!["xlsx", "xls", "csv"].includes(extension)) {
    throw new ImportFileError("Upload a .xlsx, .xls, or .csv file.");
  }
  assertFileKind(data, extension);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "buffer", raw: false });
  } catch {
    throw new ImportFileError("The file could not be parsed. Check that it is a valid spreadsheet.");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ImportFileError("The file has no sheets.");
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!matrix.length) throw new ImportFileError("The file is empty.");

  const headers = (matrix[0] ?? []).map((cell) => String(cell ?? ""));
  if (headers.every((header) => !normalizeHeader(header))) {
    throw new ImportFileError("The file is missing a header row.");
  }

  const mapped = headers.map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? null);
  if (!mapped.includes("name") || !mapped.includes("phone")) {
    throw new ImportFileError("The file must include Name and Phone columns.");
  }

  const rows: ParsedLeadRow[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const line = matrix[index] ?? [];
    if (line.every((cell) => String(cell ?? "").trim() === "")) continue;
    const record = { name: "", phone: "", email: "", company: "", notes: "" };
    const extra: Record<string, string> = {};
    headers.forEach((header, column) => {
      const value = String(line[column] ?? "").trim();
      const key = mapped[column];
      if (key) {
        if (!record[key]) record[key] = value;
      } else if (normalizeHeader(header)) {
        extra[header.trim()] = value;
      }
    });
    rows.push({ rowNumber: index + 1, ...record, extra });
  }

  if (!rows.length) throw new ImportFileError("The file has no data rows.");
  if (rows.length > 5000) throw new ImportFileError("A single import can include at most 5000 rows.");
  return { fileName, rows };
}
