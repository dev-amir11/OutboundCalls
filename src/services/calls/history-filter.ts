import { z } from "zod";
import { ANSWER_TYPE_OPTIONS, CALL_DATE_PRESETS, OUTCOME_OPTIONS } from "@/lib/constants";
import {
  dayWindow,
  getAppTimeZone,
  inclusiveDateRange,
  startOfZonedDay,
  type InstantRange,
} from "@/lib/zoned-time";
import type { AnswerType, CallOutcome } from "@/services/calls/state-machine";

export type CallHistoryFilter = {
  search?: string;
  datePreset?: "today" | "yesterday" | "last_7_days";
  from?: string;
  to?: string;
  campaignId?: string;
  outcome?: CallOutcome;
  answerType?: AnswerType;
};

const outcomes = OUTCOME_OPTIONS.map((item) => item.value).filter(Boolean) as [CallOutcome, ...CallOutcome[]];
const answers = ANSWER_TYPE_OPTIONS.map((item) => item.value).filter(Boolean) as [AnswerType, ...AnswerType[]];
const dates = CALL_DATE_PRESETS.map((item) => item.value).filter(Boolean) as [
  "today" | "yesterday" | "last_7_days",
  ...Array<"today" | "yesterday" | "last_7_days">,
];

const schema = z.object({
  q: z.string().optional(),
  datePreset: z.enum(dates).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  campaignId: z.string().optional(),
  outcome: z.enum(outcomes).optional(),
  answerType: z.enum(answers).optional(),
});

function clean(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function parseCallHistoryFilter(input: unknown): CallHistoryFilter {
  const record = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const parsed = schema.safeParse({
    q: clean(record.q),
    datePreset: clean(record.datePreset),
    from: clean(record.from),
    to: clean(record.to),
    campaignId: clean(record.campaignId),
    outcome: clean(record.outcome),
    answerType: clean(record.answerType),
  });
  const data = parsed.success ? parsed.data : {};
  return {
    search: data.q,
    datePreset: data.datePreset,
    from: data.from,
    to: data.to,
    campaignId: data.campaignId,
    outcome: data.outcome,
    answerType: data.answerType,
  };
}

export function resolveCallWindow(filter: CallHistoryFilter, now = new Date(), timeZone = getAppTimeZone()): InstantRange | undefined {
  let window: InstantRange | undefined;
  if (filter.datePreset === "today") window = dayWindow(now, timeZone, 0);
  if (filter.datePreset === "yesterday") window = dayWindow(now, timeZone, -1);
  if (filter.datePreset === "last_7_days") {
    window = { gte: startOfZonedDay(now, timeZone, -6), lt: startOfZonedDay(now, timeZone, 1) };
  }
  const custom = inclusiveDateRange(filter.from, filter.to, timeZone);
  if (!window) return custom;
  if (!custom) return window;
  return {
    gte: new Date(Math.max(window.gte.getTime(), custom.gte.getTime())),
    lt: new Date(Math.min(window.lt.getTime(), custom.lt.getTime())),
  };
}
