"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CONCURRENCY_OPTIONS, DATE_PRESETS, LEAD_PRESETS, MOCK_RESULT_OPTIONS } from "@/lib/constants";
import { countMatchesAction, startCampaignAction } from "@/app/actions/campaigns";
import { describeLeadFilter, parseLeadFilter } from "@/services/leads/lead-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a campaign name.").max(120),
  concurrency: z.string().refine((value) => (CONCURRENCY_OPTIONS as readonly number[]).map(String).includes(value), "Choose a concurrency limit."),
  maxAttempts: z.string().refine((value) => ["1", "2", "3"].includes(value), "Choose 1, 2, or 3 attempts."),
  retryNoAnswer: z.boolean(),
  retryBusy: z.boolean(),
  retryFailed: z.boolean(),
  forcedOutcome: z.enum(["RANDOM", "ANSWERED", "VOICEMAIL", "NO_ANSWER", "BUSY", "FAILED"]),
  q: z.string().optional(),
  preset: z.string().optional(),
  datePreset: z.string().optional(),
  importFrom: z.string().optional(),
  importTo: z.string().optional(),
  callFrom: z.string().optional(),
  callTo: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const selectClass = "h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 text-sm text-zinc-100";

export function CampaignForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ total: number; description: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      concurrency: "10",
      maxAttempts: "1",
      retryNoAnswer: true,
      retryBusy: true,
      retryFailed: false,
      forcedOutcome: "RANDOM",
      preset: "all",
      datePreset: "",
      q: "",
      importFrom: "",
      importTo: "",
      callFrom: "",
      callTo: "",
    },
  });

  function filterPayload(values: FormValues) {
    return {
      q: values.q,
      preset: values.preset,
      datePreset: values.datePreset,
      importFrom: values.importFrom,
      importTo: values.importTo,
      callFrom: values.callFrom,
      callTo: values.callTo,
    };
  }

  async function calculate(values: FormValues) {
    setError(null);
    const result = await countMatchesAction(filterPayload(values));
    if (!result.ok) {
      setError(result.error);
      setMatch(null);
      return;
    }
    setMatch({ total: result.total, description: result.description });
    setConfirming(false);
  }

  return (
    <form className="grid gap-6" onSubmit={form.handleSubmit(calculate)}>
      <section className="grid gap-4 rounded-xl border border-white/10 bg-[#161b24] p-5">
        <h2 className="font-semibold">Campaign</h2>
        <label className="grid gap-1.5">
          <Label>Name</Label>
          <Input {...form.register("name")} placeholder="September Promotion" />
          {form.formState.errors.name ? <span className="text-sm text-rose-300">{form.formState.errors.name.message}</span> : null}
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5">
            <Label>Concurrency</Label>
            <select className={selectClass} {...form.register("concurrency")}>
              {CONCURRENCY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <Label>Max attempts</Label>
            <select className={selectClass} {...form.register("maxAttempts")}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <Label>Mock result</Label>
            <select className={selectClass} {...form.register("forcedOutcome")}>
              {MOCK_RESULT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...form.register("retryNoAnswer")} /> Retry no answer
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...form.register("retryBusy")} /> Retry busy
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...form.register("retryFailed")} /> Retry failed
          </label>
        </div>
        <p className="text-sm text-zinc-400">
          Concurrency options include 50 and 60 for a future carrier. This mock provider does not place real concurrent calls.
        </p>
      </section>

      <section className="grid gap-4 rounded-xl border border-white/10 bg-[#161b24] p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Lead filter</h2>
        <label className="grid gap-1.5 md:col-span-2">
          <Label>Search</Label>
          <Input {...form.register("q")} placeholder="Optional name, phone, or company" />
        </label>
        <label className="grid gap-1.5">
          <Label>Status</Label>
          <select className={selectClass} {...form.register("preset")}>
            {LEAD_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <Label>Date</Label>
          <select className={selectClass} {...form.register("datePreset")}>
            {DATE_PRESETS.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <Label>Imported from</Label>
          <Input type="date" {...form.register("importFrom")} />
        </label>
        <label className="grid gap-1.5">
          <Label>Imported to</Label>
          <Input type="date" {...form.register("importTo")} />
        </label>
        <label className="grid gap-1.5">
          <Label>Last call from</Label>
          <Input type="date" {...form.register("callFrom")} />
        </label>
        <label className="grid gap-1.5">
          <Label>Last call to</Label>
          <Input type="date" {...form.register("callTo")} />
        </label>
      </section>

      {error ? <p className="rounded-md bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {match ? (
        <div className="rounded-xl border border-teal-800/60 bg-teal-950/40 px-4 py-3 text-sm text-teal-200">
          <p className="font-medium">{match.total} leads matched.</p>
          <p className="mt-1">{match.description || describeLeadFilter(parseLeadFilter(filterPayload(form.getValues())))}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" disabled={form.formState.isSubmitting}>
          Calculate matches
        </Button>
        <Button
          type="button"
          disabled={!match || match.total === 0}
          onClick={() => setConfirming(true)}
        >
          Start calling
        </Button>
      </div>

      {confirming && match ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#161b24] p-6 shadow-xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold">Start calling?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {match.total} leads matched. The mock provider will simulate these calls. No telephone call will be placed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button
                type="button"
                disabled={form.formState.isSubmitting}
                onClick={form.handleSubmit(async (values) => {
                  setError(null);
                  const result = await startCampaignAction({
                    name: values.name,
                    concurrency: Number(values.concurrency),
                    maxAttempts: Number(values.maxAttempts),
                    retryNoAnswer: values.retryNoAnswer,
                    retryBusy: values.retryBusy,
                    retryFailed: values.retryFailed,
                    forcedOutcome: values.forcedOutcome,
                    filter: filterPayload(values),
                  });
                  if (!result.ok) {
                    setError(result.error);
                    setConfirming(false);
                    return;
                  }
                  router.push(`/campaigns/${result.id}`);
                })}
              >
                Start calling
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
