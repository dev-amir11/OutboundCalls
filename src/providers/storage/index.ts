import { LocalStorageProvider } from "@/providers/storage/local-storage-provider";
import type { StorageProvider } from "@/providers/storage/storage-provider";

let cached: StorageProvider | null = null;

export function getStorageProvider() {
  if (cached) return cached;
  const name = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  if (name !== "local") {
    throw new Error(`Storage provider "${name}" is not implemented. Use STORAGE_PROVIDER=local.`);
  }
  cached = new LocalStorageProvider();
  return cached;
}
