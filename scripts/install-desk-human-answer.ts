import "dotenv/config";
import { copyFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { LocalStorageProvider } from "../src/providers/storage/local-storage-provider";

async function main() {
  const source = join(process.cwd(), "public", "desk-human-answer.wav");
  const bytes = statSync(source).size;
  const durationSeconds = Math.max(1, Math.round(bytes / 44000));
  const name = "Desk human answer (spoken — not a carrier beep)";
  const fileName = "desk-human-answer.wav";

  const active = await prisma.audioMessage.findFirst({
    where: { kind: "HUMAN_ANSWER", isActive: true },
  });
  const existing =
    active ??
    (await prisma.audioMessage.findFirst({
      where: { kind: "HUMAN_ANSWER" },
      orderBy: { createdAt: "desc" },
    }));

  let target = existing;
  if (!target) {
    const storage = new LocalStorageProvider();
    const saved = await storage.save({
      fileName,
      mimeType: "audio/wav",
      data: readFileSync(source),
    });
    target = await prisma.audioMessage.create({
      data: {
        kind: "HUMAN_ANSWER",
        name,
        fileName,
        storagePath: saved.storagePath,
        mimeType: "audio/wav",
        durationSeconds,
        isActive: true,
        isSeed: false,
      },
    });
  } else {
    const dest = target.storagePath.match(/^[A-Za-z]:[\\/]/)
      ? target.storagePath
      : join(process.cwd(), target.storagePath);
    copyFileSync(source, dest);
    target = await prisma.audioMessage.update({
      where: { id: target.id },
      data: {
        isActive: true,
        durationSeconds,
        name,
        fileName,
        mimeType: "audio/wav",
      },
    });
  }

  await prisma.audioMessage.updateMany({
    where: { kind: "HUMAN_ANSWER", id: { not: target.id } },
    data: { isActive: false },
  });

  console.log(
    JSON.stringify(
      {
        id: target.id,
        storagePath: target.storagePath,
        durationSeconds,
        bytes,
        name,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
