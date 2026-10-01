import { z } from "zod";
import { DATE_PRESETS, LEAD_PRESETS, type DatePreset, type LeadPreset } from "@/lib/constants";
import {
  dayWindow,
  getAppTimeZone,
  inRange,
  inclusiveDateRange,
  intersectRanges,
  startOfZonedDay,
  startOfZonedWeek,
  type InstantRange,
} from "@/lib/zoned-time";
import type { CallOutcome } from "@/services/calls/state-machine";

export type LeadActivity = "NEW" | "IN_PROGRESS" | "IDLE";

export type LeadFilter = {
  search?: string;
  preset: LeadPreset;
  datePreset?: Exclude<DatePreset, "">;
  importFrom?: string;
  importTo?: string;
  callFrom?: string;
  callTo?: string;
};

export type LeadSnapshot = {
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  createdAt: Date;
  lastCallAt: Date | null;
  lastCallStatus: CallOutcome | null;
  activity: LeadActivity;
  callAttempts: number;
};

const presetValues = LEAD_PRESETS.map((item) => item.value) as [LeadPreset, ...LeadPreset[]];
const dateValues = DATE_PRESETS.map((item) => item.value).filter((value) => value !== "") as [
  Exclude<DatePreset, "">,
  ...Exclude<DatePreset, "">[],
];

export const leadFilterSchema = z.object({
  q: z.string().optional(),
  preset: z.enum(presetValues).optional(),
  datePreset: z.union([z.literal(""), z.enum(dateValues)]).optional(),
  importFrom: z.string().optional(),
  importTo: z.string().optional(),
  callFrom: z.string().optional(),
  callTo: z.string().optional(),
});

function clean(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function parseLeadFilter(input: unknown): LeadFilter {
  const record = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const parsed = leadFilterSchema.safeParse({
    q: clean(record.q),
    preset: clean(record.preset),
    datePreset: clean(record.datePreset),
    importFrom: clean(record.importFrom),
    importTo: clean(record.importTo),
    callFrom: clean(record.callFrom),
    callTo: clean(record.callTo),
  });
  const data = parsed.success ? parsed.data : {};
  return {
    search: data.q,
    preset: data.preset ?? "all",
    datePreset: data.datePreset || undefined,
    importFrom: data.importFrom,
    importTo: data.importTo,
    callFrom: data.callFrom,
    callTo: data.callTo,
  };
}

export type ResolvedLeadWindows = {
  createdAt?: InstantRange;
  lastCallAt?: InstantRange;
  requiredOutcome?: CallOutcome;
};

export function resolveLeadWindows(filter: LeadFilter, now: Date, timeZone = getAppTimeZone()): ResolvedLeadWindows {
  const windows: ResolvedLeadWindows = {};
  switch (filter.datePreset) {
    case "imported_today":
      windows.createdAt = dayWindow(now, timeZone, 0);
      break;
    case "imported_yesterday":
      windows.createdAt = dayWindow(now, timeZone, -1);
      break;
    case "imported_this_week":
      windows.createdAt = { gte: startOfZonedWeek(now, timeZone), lt: startOfZonedDay(now, timeZone, 1) };
      break;
    case "called_today":
      windows.lastCallAt = dayWindow(now, timeZone, 0);
      break;
    case "failed_today":
      windows.lastCallAt = dayWindow(now, timeZone, 0);
      windows.requiredOutcome = "FAILED";
      break;
    case "failed_yesterday":
      windows.lastCallAt = dayWindow(now, timeZone, -1);
      windows.requiredOutcome = "FAILED";
      break;
    case "no_answer_yesterday":
      windows.lastCallAt = dayWindow(now, timeZone, -1);
      windows.requiredOutcome = "NO_ANSWER";
      break;
    case "voicemail_yesterday":
      windows.lastCallAt = dayWindow(now, timeZone, -1);
      windows.requiredOutcome = "VOICEMAIL";
      break;
    default:
      break;
  }

  windows.createdAt = intersectRanges(windows.createdAt, inclusiveDateRange(filter.importFrom, filter.importTo, timeZone));
  windows.lastCallAt = intersectRanges(windows.lastCallAt, inclusiveDateRange(filter.callFrom, filter.callTo, timeZone));
  return windows;
}

export function matchesLeadFilter(lead: LeadSnapshot, filter: LeadFilter, now: Date, timeZone = getAppTimeZone()) {
  if (filter.search) {
    const haystack = [lead.name, lead.phone, lead.email, lead.company].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(filter.search.toLowerCase())) return false;
  }

  switch (filter.preset) {
    case "never_called":
      if (lead.callAttempts !== 0) return false;
      break;
    case "called":
      if (lead.callAttempts <= 0) return false;
      break;
    case "successful":
      if (lead.lastCallStatus !== "SUCCESSFUL") return false;
      break;
    case "failed":
      if (lead.lastCallStatus !== "FAILED") return false;
      break;
    case "voicemail":
      if (lead.lastCallStatus !== "VOICEMAIL") return false;
      break;
    case "no_answer":
      if (lead.lastCallStatus !== "NO_ANSWER") return false;
      break;
    case "busy":
      if (lead.lastCallStatus !== "BUSY") return false;
      break;
    case "in_progress":
      if (lead.activity !== "IN_PROGRESS") return false;
      break;
    default:
      break;
  }

  const windows = resolveLeadWindows(filter, now, timeZone);
  if (windows.createdAt && !inRange(lead.createdAt, windows.createdAt)) return false;
  if (windows.lastCallAt && (!lead.lastCallAt || !inRange(lead.lastCallAt, windows.lastCallAt))) return false;
  if (windows.requiredOutcome && lead.lastCallStatus !== windows.requiredOutcome) return false;
  return true;
}

const PRESET_LABELS = Object.fromEntries(LEAD_PRESETS.map((item) => [item.value, item.label]));
const DATE_LABELS = Object.fromEntries(DATE_PRESETS.map((item) => [item.value, item.label]));

export function describeLeadFilter(filter: LeadFilter) {
  const parts: string[] = [];
  if (filter.preset !== "all") parts.push(PRESET_LABELS[filter.preset] ?? filter.preset);
  if (filter.datePreset) parts.push(DATE_LABELS[filter.datePreset] ?? filter.datePreset);
  if (filter.search) parts.push(`Search “${filter.search}”`);
  if (filter.importFrom || filter.importTo) {
    parts.push(`Imported ${filter.importFrom || "…"} to ${filter.importTo || "…"}`);
  }
  if (filter.callFrom || filter.callTo) {
    parts.push(`Called ${filter.callFrom || "…"} to ${filter.callTo || "…"}`);
  }
  return parts.join(" · ") || "All leads";
}
