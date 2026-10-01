"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { actionError } from "@/lib/action-error";
import { confirmImport, stageImport } from "@/services/imports/import-service";

export async function uploadImportAction(_previous: { error?: string } | null, formData: FormData) {
  try {
    const user = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a spreadsheet to upload." };
    const record = await stageImport({
      fileName: file.name,
      data: Buffer.from(await file.arrayBuffer()),
      userId: user.id,
    });
    redirect(`/leads/import?preview=${record.id}`);
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function confirmImportAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("importId") ?? "");
  try {
    const result = await confirmImport(id);
    redirect(`/leads?imported=${result.imported}`);
  } catch (error) {
    const message = actionError(error);
    redirect(`/leads/import?preview=${id}&error=${encodeURIComponent(message)}`);
  }
}
