import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "@/providers/storage/storage-provider";

function rootDir() {
  return path.join(process.cwd(), "storage", "audio");
}

function safeName(fileName: string) {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 80) || "audio";
}

export class LocalStorageProvider implements StorageProvider {
  async save(input: { fileName: string; mimeType: string; data: Buffer }) {
    const directory = rootDir();
    await mkdir(directory, { recursive: true });
    const storagePath = path.join(directory, `${crypto.randomUUID()}-${safeName(input.fileName)}`);
    await writeFile(storagePath, input.data);
    return { storagePath };
  }

  async read(storagePath: string) {
    const resolved = path.resolve(storagePath);
    const root = path.resolve(rootDir());
    if (!resolved.startsWith(root)) {
      throw new Error("Audio path is outside local storage.");
    }
    return readFile(resolved);
  }

  async delete(storagePath: string) {
    const resolved = path.resolve(storagePath);
    const root = path.resolve(rootDir());
    if (!resolved.startsWith(root)) return;
    await unlink(resolved).catch(() => undefined);
  }
}
