import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
  prismaUrl?: string;
};

function createClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  });
  pool.on("error", () => {
    /* idle client errors are expected when prisma local recycles sockets */
  });
  globalForPrisma.prismaPool = pool;
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

function getClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!globalForPrisma.prisma || globalForPrisma.prismaUrl !== connectionString) {
    const prevClient = globalForPrisma.prisma;
    const prevPool = globalForPrisma.prismaPool;
    globalForPrisma.prisma = createClient(connectionString);
    globalForPrisma.prismaUrl = connectionString;
    void prevClient?.$disconnect().catch(() => undefined);
    void prevPool?.end().catch(() => undefined);
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
