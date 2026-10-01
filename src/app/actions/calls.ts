"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { hangupCall, tickCallingQueue } from "@/services/calls/call-service";

export async function tickQueueAction() {
  await requireUser();
  await tickCallingQueue();
}

export async function hangupCallAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("callId") ?? "");
  await hangupCall(id);
  revalidatePath("/calls");
  revalidatePath(`/calls/${id}`);
}
