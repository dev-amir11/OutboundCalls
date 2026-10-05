import "dotenv/config";
import { copyFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";

async function main() {
  const source = join(process.cwd(), "public", "drop-voicemail.wav");
  const bytes = statSync(source).size;
  // Rough duration for PCM/SAPI wav (~22kHz mono 16-bit) — better than leaving seed 4s beep.
  const durationSeconds = Math.max(1, Math.round(bytes / 44000));

  const active = await prisma.audioMessage.findFirst({
    where: { kind: "VOICEMAIL", isActive: true },
  });
  const target =
    active ??
    (await prisma.audioMessage.findFirst({
      where: { kind: "VOICEMAIL" },
      orderBy: { createdAt: "desc" },
    }));

  if (!target) {
    throw new Error("No VOICEMAIL audioMessage row found. Upload one in the UI or re-seed.");
  }

  const dest = target.storagePath.match(/^[A-Za-z]:[\\/]/)
    ? target.storagePath
    : join(process.cwd(), target.storagePath);
  copyFileSync(source, dest);

  await prisma.audioMessage.update({
    where: { id: target.id },
    data: {
      isActive: true,
      durationSeconds,
      name: "Desk drop (spoken — not a carrier beep)",
      fileName: "drop-voicemail.wav",
      mimeType: "audio/wav",
    },
  });

  // Ensure only this one is active for VOICEMAIL.
  await prisma.audioMessage.updateMany({
    where: { kind: "VOICEMAIL", id: { not: target.id } },
    data: { isActive: false },
  });

  console.log(
    JSON.stringify(
      {
        id: target.id,
        storagePath: target.storagePath,
        durationSeconds,
        bytes,
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
