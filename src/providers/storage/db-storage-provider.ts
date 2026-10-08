import { prisma } from "@/lib/prisma";
import type { StorageProvider } from "@/providers/storage/storage-provider";

const PREFIX = "db:";

function parseId(storagePath: string) {
  if (!storagePath.startsWith(PREFIX)) {
    throw new Error(`Invalid DB storage path: ${storagePath}`);
  }
  const id = storagePath.slice(PREFIX.length).trim();
  if (!id) throw new Error("DB storage path is missing an id.");
  return id;
}

export class DbStorageProvider implements StorageProvider {
  async save(input: { fileName: string; mimeType: string; data: Buffer }) {
    const row = await prisma.storedAudio.create({
      data: {
        data: new Uint8Array(input.data),
        mimeType: input.mimeType || "application/octet-stream",
      },
    });
    return { storagePath: `${PREFIX}${row.id}` };
  }

  async read(storagePath: string) {
    const id = parseId(storagePath);
    const row = await prisma.storedAudio.findUnique({ where: { id } });
    if (!row) throw new Error("Audio blob not found.");
    return Buffer.from(row.data);
  }

  async delete(storagePath: string) {
    const id = parseId(storagePath);
    await prisma.storedAudio.delete({ where: { id } }).catch(() => undefined);
  }
}
