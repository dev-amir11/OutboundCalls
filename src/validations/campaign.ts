import { z } from "zod";
import { CONCURRENCY_OPTIONS } from "@/lib/constants";
import { leadFilterSchema, parseLeadFilter } from "@/services/leads/lead-filter";

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a campaign name.").max(120),
  concurrency: z
    .number()
    .refine((value) => (CONCURRENCY_OPTIONS as readonly number[]).includes(value), "Choose a concurrency limit."),
  maxAttempts: z.number().int().min(1).max(3),
  retryNoAnswer: z.boolean(),
  retryBusy: z.boolean(),
  retryFailed: z.boolean(),
  forcedOutcome: z.enum(["RANDOM", "ANSWERED", "VOICEMAIL", "NO_ANSWER", "BUSY", "FAILED"]),
  filter: leadFilterSchema,
});

export function parseCampaignInput(input: unknown) {
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the campaign form." };
  }
  const forced = parsed.data.forcedOutcome === "RANDOM" ? null : parsed.data.forcedOutcome;
  return {
    ok: true as const,
    data: {
      ...parsed.data,
      forcedOutcome: forced,
      filter: parseLeadFilter(parsed.data.filter),
    },
  };
}
