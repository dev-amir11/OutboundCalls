import { getStorageProvider } from "@/providers/storage";
import {
  activateMessage,
  createMessage,
  deleteMessage,
  findActiveMessage,
  findMessage,
  listMessages,
} from "@/repositories/message-repository";
import type { MessageKind } from "@/generated/prisma/client";

const ALLOWED = new Map<string, string>([
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["m4a", "audio/mp4"],
]);

export async function getMessages(kind: MessageKind) {
  const [messages, active] = await Promise.all([listMessages(kind), findActiveMessage(kind)]);
  return { messages, active };
}

export async function uploadMessage(input: {
  kind: MessageKind;
  name: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
  makeActive: boolean;
}) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Enter a message name.");
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED.has(extension)) throw new Error("Upload an MP3, WAV, or M4A file.");
  if (input.data.length > 10 * 1024 * 1024) throw new Error("Audio files must be 10 MB or smaller.");

  const stored = await getStorageProvider().save({
    fileName: input.fileName,
    mimeType: ALLOWED.get(extension) ?? input.mimeType,
    data: input.data,
  });
  const durationSeconds = await readDuration(input.data, ALLOWED.get(extension) ?? input.mimeType);
  const message = await createMessage({
    kind: input.kind,
    name,
    fileName: input.fileName,
    storagePath: stored.storagePath,
    mimeType: (ALLOWED.get(extension) ?? input.mimeType) || "application/octet-stream",
    durationSeconds,
    isActive: false,
  });
  if (input.makeActive) await activateMessage(message.id, input.kind);
  return message;
}

export async function selectActiveMessage(id: string) {
  const message = await findMessage(id);
  if (!message) throw new Error("Message not found.");
  await activateMessage(message.id, message.kind);
}

export async function removeMessage(id: string) {
  const message = await findMessage(id);
  if (!message) throw new Error("Message not found.");
  await getStorageProvider().delete(message.storagePath);
  await deleteMessage(message.id);
}

export async function readMessageFile(id: string) {
  const message = await findMessage(id);
  if (!message) return null;
  const data = await getStorageProvider().read(message.storagePath);
  return { message, data };
}

async function readDuration(data: Buffer, mimeType: string) {
  try {
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(data, { mimeType });
    if (!metadata.format.duration) return null;
    return Math.max(0, Math.round(metadata.format.duration));
  } catch {
    return null;
  }
}
