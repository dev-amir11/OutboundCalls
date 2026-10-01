"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { actionError } from "@/lib/action-error";
import { removeMessage, selectActiveMessage, uploadMessage } from "@/services/voicemail/message-service";
import type { MessageKind } from "@/generated/prisma/client";

function pathFor(kind: MessageKind) {
  return kind === "HUMAN_ANSWER" ? "/messages/human" : "/messages/voicemail";
}

export async function uploadMessageAction(_previous: { error?: string; ok?: boolean } | null, formData: FormData) {
  await requireUser();
  try {
    const kind = String(formData.get("kind") ?? "") as MessageKind;
    if (kind !== "HUMAN_ANSWER" && kind !== "VOICEMAIL") return { error: "Unknown message type." };
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose an audio file." };
    await uploadMessage({
      kind,
      name: String(formData.get("name") ?? ""),
      fileName: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
      makeActive: formData.get("makeActive") === "on",
    });
    revalidatePath(pathFor(kind));
    return { ok: true };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function activateMessageAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "") as MessageKind;
  await selectActiveMessage(id);
  revalidatePath(pathFor(kind));
}

export async function deleteMessageAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "") as MessageKind;
  await removeMessage(id);
  revalidatePath(pathFor(kind));
}
