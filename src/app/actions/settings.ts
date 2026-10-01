"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setGlobalForcedOutcome } from "@/repositories/settings-repository";
import type { ScheduledOutcome } from "@/services/calls/state-machine";

export async function saveTelephonySettingsAction(formData: FormData) {
  await requireUser();
  const value = String(formData.get("forcedOutcome") ?? "RANDOM");
  const outcome =
    value === "ANSWERED" || value === "VOICEMAIL" || value === "NO_ANSWER" || value === "BUSY" || value === "FAILED"
      ? (value as ScheduledOutcome)
      : null;
  await setGlobalForcedOutcome(outcome);
  revalidatePath("/settings/telephony");
}
