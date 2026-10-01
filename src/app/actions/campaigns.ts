"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { actionError } from "@/lib/action-error";
import { parseLeadFilter } from "@/services/leads/lead-filter";
import { parseCampaignInput } from "@/validations/campaign";
import { cancelCampaign, pauseCampaign, previewCampaignMatch, resumeCampaign, startCampaign } from "@/services/campaigns/campaign-service";

export async function countMatchesAction(filter: unknown) {
  await requireUser();
  try {
    return { ok: true as const, ...(await previewCampaignMatch(parseLeadFilter(filter))) };
  } catch (error) {
    return { ok: false as const, error: actionError(error), total: 0, description: "" };
  }
}

export async function startCampaignAction(input: unknown) {
  await requireUser();
  const parsed = parseCampaignInput(input);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  try {
    const campaign = await startCampaign(parsed.data);
    revalidatePath("/campaigns");
    return { ok: true as const, id: campaign.id };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function pauseCampaignAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await pauseCampaign(id);
  revalidatePath(`/campaigns/${id}`);
}

export async function resumeCampaignAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await resumeCampaign(id);
  revalidatePath(`/campaigns/${id}`);
}

export async function cancelCampaignAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await cancelCampaign(id);
  revalidatePath(`/campaigns/${id}`);
}
