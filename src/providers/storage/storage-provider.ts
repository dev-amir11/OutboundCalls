export type StoredObject = {
  storagePath: string;
};

export interface StorageProvider {
  save(input: { fileName: string; mimeType: string; data: Buffer }): Promise<StoredObject>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}
