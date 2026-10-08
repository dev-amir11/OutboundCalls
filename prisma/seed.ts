import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { startOfZonedDay } from "../src/lib/zoned-time";
import { getStorageProvider } from "../src/providers/storage";
import type { AnswerType, CallLifecycleStatus, CallOutcome, ForcedOutcome } from "../src/generated/prisma/client";

const FIRST = [
  "John", "Jane", "Amina", "Wei", "Sofia", "Omar", "Priya", "Luis", "Noah", "Mia",
  "Ethan", "Ava", "Hassan", "Chloe", "Elena", "Yusuf", "Hana", "Leo", "Nora", "Adam",
  "Layla", "Ivan", "Zara", "Owen", "Maya", "Felix", "Aisha", "Hugo", "Lina", "Samir",
  "Ines", "Jonah", "Ruth", "Kai", "Nadia", "Arun", "Esme", "Theo", "Leila", "Malik",
  "Sara", "Imani", "Peter", "Grace", "Colin", "Rita", "Hugh", "Diane", "Farah", "Marcus",
];
const LAST = [
  "Smith", "Doe", "Khan", "Chen", "Rossi", "Haddad", "Shah", "Garcia", "Bennett", "Patel",
  "Nguyen", "Brooks", "Ali", "Meyer", "Santos", "Ibrahim", "Sato", "Novak", "Kim", "Diallo",
  "Okeke", "Petrov", "Rahman", "Clark", "Singh", "Moreau", "Hassan", "Silva", "Berg", "Farouk",
  "Costa", "Adler", "Cohen", "Tanaka", "Mensah", "Kapoor", "Walsh", "Horvat", "Nasser", "Owusu",
  "Lind", "Diallo", "Grant", "Okafor", "Hughes", "Bose", "Perez", "Novak", "Yilmaz", "Reed",
];

type Outcome = "SUCCESSFUL" | "VOICEMAIL" | "NO_ANSWER" | "BUSY" | "FAILED";

function phone(index: number) {
  const suffix = String(100 + index).padStart(4, "0");
  return { display: `+1 206 555 ${suffix}`, e164: `+1206555${suffix}` };
}

function plus(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function wav(seconds = 3) {
  const sampleRate = 8000;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 2800);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

function lifecycle(outcome: Outcome): { status: CallLifecycleStatus; answerType: AnswerType } {
  if (outcome === "SUCCESSFUL") return { status: "COMPLETED", answerType: "ANSWERED_HUMAN" };
  if (outcome === "VOICEMAIL") return { status: "COMPLETED", answerType: "ANSWERING_MACHINE" };
  return { status: outcome, answerType: outcome };
}

function eventsFor(outcome: Outcome, startedAt: Date, endedAt: Date) {
  const at = (seconds: number) => new Date(startedAt.getTime() + seconds * 1000);
  const rows: { status: CallLifecycleStatus; message: string; createdAt: Date }[] = [
    { status: "QUEUED", message: "Queued for dialing (simulated, MOCK PROVIDER)", createdAt: startedAt },
    { status: "DIALING", message: "Dialing (simulated)", createdAt: at(2) },
    { status: "RINGING", message: "Ringing (simulated)", createdAt: at(4) },
  ];
  if (outcome === "SUCCESSFUL") {
    rows.push(
      { status: "ANSWERED_HUMAN", message: "Answered by a human (simulated)", createdAt: at(6) },
      { status: "PLAY_HUMAN_MESSAGE", message: "Human answer message played: [SEED] Human Answer Message", createdAt: at(8) },
      { status: "COMPLETED", message: "Call completed (simulated)", createdAt: endedAt },
    );
  } else if (outcome === "VOICEMAIL") {
    rows.push(
      { status: "ANSWERING_MACHINE", message: "Answering machine detected (simulated)", createdAt: at(6) },
      { status: "PLAY_VOICEMAIL", message: "Voicemail message played: [SEED] Voicemail Message", createdAt: at(8) },
      { status: "COMPLETED", message: "Call completed after voicemail (simulated)", createdAt: endedAt },
    );
  } else if (outcome === "NO_ANSWER") {
    rows.push({ status: "NO_ANSWER", message: "No answer (simulated)", createdAt: endedAt });
  } else if (outcome === "BUSY") {
    rows.push({ status: "BUSY", message: "Busy (simulated)", createdAt: endedAt });
  } else {
    rows.push({ status: "FAILED", message: "Call failed (simulated)", createdAt: endedAt });
  }
  return rows;
}

async function main() {
  const timeZone = process.env.APP_TIMEZONE || "UTC";
  const now = new Date();
  const today = startOfZonedDay(now, timeZone, 0);
  const yesterday = startOfZonedDay(now, timeZone, -1);
  const older = startOfZonedDay(now, timeZone, -10);
  const email = (process.env.ADMIN_EMAIL || "admin@outbound.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  await prisma.lead.deleteMany({ where: { isSeed: true } });
  await prisma.campaign.deleteMany({ where: { isSeed: true } });
  await prisma.leadImport.deleteMany({ where: { isSeed: true } });
  const seedMessages = await prisma.audioMessage.findMany({
    where: { isSeed: true },
    select: { storagePath: true },
  });
  const seedBlobIds = seedMessages
    .map((m) => m.storagePath)
    .filter((p) => p.startsWith("db:"))
    .map((p) => p.slice(3));
  if (seedBlobIds.length > 0) {
    await prisma.storedAudio.deleteMany({ where: { id: { in: seedBlobIds } } });
  }
  await prisma.audioMessage.deleteMany({ where: { isSeed: true } });

  const passwordHash = await hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Administrator", passwordHash },
  });

  const storage = getStorageProvider();
  const humanFile = await storage.save({ fileName: "seed-human-answer.wav", mimeType: "audio/wav", data: wav(3) });
  const voicemailFile = await storage.save({ fileName: "seed-voicemail.wav", mimeType: "audio/wav", data: wav(4) });
  const human = await prisma.audioMessage.create({
    data: {
      kind: "HUMAN_ANSWER",
      name: "[SEED] Human Answer Message",
      fileName: "seed-human-answer.wav",
      storagePath: humanFile.storagePath,
      mimeType: "audio/wav",
      durationSeconds: 3,
      isActive: true,
      isSeed: true,
    },
  });
  const voicemail = await prisma.audioMessage.create({
    data: {
      kind: "VOICEMAIL",
      name: "[SEED] Voicemail Message",
      fileName: "seed-voicemail.wav",
      storagePath: voicemailFile.storagePath,
      mimeType: "audio/wav",
      durationSeconds: 4,
      isActive: true,
      isSeed: true,
    },
  });

  const imported = await prisma.leadImport.create({
    data: {
      fileName: "[SEED] sample-leads.xlsx",
      status: "COMPLETED",
      totalRows: 50,
      validRows: 50,
      invalidRows: 0,
      duplicateRows: 0,
      importedRows: 50,
      preview: { note: "Seeded sample import. These leads are not from a live list." },
      isSeed: true,
    },
  });

  const yesterdayOutcome: Outcome[] = [
    "FAILED", "FAILED", "FAILED", "FAILED", "NO_ANSWER", "NO_ANSWER", "NO_ANSWER", "VOICEMAIL", "VOICEMAIL", "SUCCESSFUL",
  ];
  const todayOutcome: Outcome[] = [
    "FAILED", "FAILED", "FAILED", "SUCCESSFUL", "SUCCESSFUL", "VOICEMAIL", "NO_ANSWER", "NO_ANSWER", "BUSY", "BUSY",
  ];
  const activePlan: { status: CallLifecycleStatus; scheduled: ForcedOutcome }[] = [
    { status: "DIALING", scheduled: "ANSWERED" },
    { status: "RINGING", scheduled: "VOICEMAIL" },
    { status: "ANSWERED_HUMAN", scheduled: "ANSWERED" },
    { status: "PLAY_VOICEMAIL", scheduled: "VOICEMAIL" },
    { status: "RINGING", scheduled: "NO_ANSWER" },
  ];

  const leadIds: string[] = [];
  for (let index = 0; index < 50; index += 1) {
    const numbers = phone(index);
    let createdAt = plus(older, index * 20);
    let activity: "NEW" | "IN_PROGRESS" | "IDLE" = "IDLE";
    let callAttempts = 4;
    let lastCallAt: Date | null = plus(older, 30);
    let lastCallStatus: CallOutcome | null = "FAILED";
    if (index < 15) {
      createdAt = plus(today, 20 + index * 15);
      activity = "NEW";
      callAttempts = 0;
      lastCallAt = null;
      lastCallStatus = null;
    } else if (index < 25) {
      createdAt = plus(yesterday, 30 + (index - 15) * 20);
      lastCallAt = plus(yesterday, 90 + (index - 15) * 20);
      lastCallStatus = yesterdayOutcome[index - 15];
    } else if (index < 35) {
      createdAt = plus(older, index * 25);
      lastCallAt = plus(today, 40 + (index - 25) * 12);
      lastCallStatus = todayOutcome[index - 25];
    } else if (index >= 45) {
      createdAt = plus(today, 10 + index);
      activity = "IN_PROGRESS";
      callAttempts = 1;
      lastCallAt = null;
      lastCallStatus = null;
    }

    const lead = await prisma.lead.create({
      data: {
        name: `${FIRST[index]} ${LAST[index]}`,
        phone: numbers.display,
        phoneNormalized: numbers.e164,
        email: `${FIRST[index].toLowerCase()}.${LAST[index].toLowerCase()}@example.com`,
        company: index % 2 === 0 ? "ABC Corp" : "XYZ Corp",
        notes: "[SEED] Sample lead for the mock calling desk.",
        importId: imported.id,
        activity,
        callAttempts,
        lastCallAt,
        lastCallStatus,
        isSeed: true,
        createdAt,
      },
    });
    leadIds.push(lead.id);
  }

  const running = await prisma.campaign.create({
    data: {
      name: "[SEED] September Promotion",
      status: "RUNNING",
      filter: { preset: "all", datePreset: "imported_today" },
      concurrency: 10,
      maxAttempts: 2,
      retryNoAnswer: true,
      retryBusy: true,
      retryFailed: false,
      matchedCount: 8,
      humanMessageId: human.id,
      voicemailMessageId: voicemail.id,
      isSeed: true,
      startedAt: plus(today, 15),
      leads: {
        create: [
          ...leadIds.slice(45).map((leadId) => ({ leadId, status: "IN_PROGRESS" as const, attempts: 1 })),
          ...leadIds.slice(8, 11).map((leadId) => ({ leadId, status: "PENDING" as const, attempts: 0 })),
        ],
      },
    },
  });

  const completed = await prisma.campaign.create({
    data: {
      name: "[SEED] August Follow-up",
      status: "COMPLETED",
      filter: { preset: "all", datePreset: "imported_yesterday" },
      concurrency: 10,
      maxAttempts: 1,
      retryNoAnswer: false,
      retryBusy: false,
      retryFailed: false,
      matchedCount: 10,
      humanMessageId: human.id,
      voicemailMessageId: voicemail.id,
      isSeed: true,
      startedAt: yesterday,
      completedAt: plus(yesterday, 240),
      leads: {
        create: leadIds.slice(15, 25).map((leadId, offset) => ({
          leadId,
          status: "COMPLETED" as const,
          attempts: 4,
          lastOutcome: yesterdayOutcome[offset],
        })),
      },
    },
  });

  await prisma.campaign.create({
    data: {
      name: "[SEED] Retry Yesterday",
      status: "PAUSED",
      filter: { preset: "failed", datePreset: "failed_yesterday" },
      concurrency: 5,
      maxAttempts: 2,
      retryNoAnswer: true,
      retryBusy: false,
      retryFailed: true,
      matchedCount: 10,
      humanMessageId: human.id,
      voicemailMessageId: voicemail.id,
      isSeed: true,
      startedAt: plus(older, 60),
      pausedAt: plus(today, 5),
      leads: {
        create: [
          ...leadIds.slice(35, 40).map((leadId) => ({ leadId, status: "PENDING" as const, attempts: 1, lastOutcome: "FAILED" as const })),
          ...leadIds.slice(40, 45).map((leadId) => ({ leadId, status: "COMPLETED" as const, attempts: 4, lastOutcome: "FAILED" as const })),
        ],
      },
    },
  });

  const olderMix: Outcome[] = ["FAILED", "NO_ANSWER", "BUSY"];
  for (let index = 15; index < 45; index += 1) {
    const primary = index < 25 ? yesterdayOutcome[index - 15] : index < 35 ? todayOutcome[index - 25] : "FAILED";
    const primaryAt = index < 25 ? plus(yesterday, 90 + (index - 15) * 20) : index < 35 ? plus(today, 40 + (index - 25) * 12) : plus(older, 80 + index);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const latest = attempt === 3;
      const outcome = latest ? primary : olderMix[attempt % olderMix.length];
      const startedAt = new Date(primaryAt.getTime() - (3 - attempt) * 26 * 60 * 60 * 1000);
      const duration = outcome === "SUCCESSFUL" ? 48 : outcome === "VOICEMAIL" ? 30 : 16;
      const endedAt = new Date(startedAt.getTime() + duration * 1000);
      const life = lifecycle(outcome);
      const call = await prisma.call.create({
        data: {
          leadId: leadIds[index],
          campaignId: index < 25 ? completed.id : null,
          provider: "mock",
          providerCallId: `mock_seed_${index}_${attempt}`,
          status: life.status,
          outcome,
          answerType: life.answerType,
          phoneNumber: phone(index).e164,
          startedAt,
          answeredAt: outcome === "SUCCESSFUL" || outcome === "VOICEMAIL" ? new Date(startedAt.getTime() + 6000) : null,
          endedAt,
          durationSeconds: duration,
          humanMessageId: human.id,
          voicemailMessageId: voicemail.id,
          scheduledOutcome: outcome === "SUCCESSFUL" ? "ANSWERED" : outcome === "VOICEMAIL" ? "VOICEMAIL" : outcome,
          isMock: true,
          isSeed: true,
          activeLeadKey: null,
        },
      });
      await prisma.callEvent.createMany({
        data: eventsFor(outcome, startedAt, endedAt).map((event) => ({ ...event, callId: call.id })),
      });
    }
  }

  for (let offset = 0; offset < activePlan.length; offset += 1) {
    const plan = activePlan[offset];
    const index = 45 + offset;
    const startedAt = plus(now, -2);
    await prisma.call.create({
      data: {
        leadId: leadIds[index],
        campaignId: running.id,
        provider: "mock",
        providerCallId: `mock_seed_active_${offset}`,
        status: plan.status,
        outcome: "IN_PROGRESS",
        answerType: plan.status === "ANSWERED_HUMAN" ? "ANSWERED_HUMAN" : plan.status === "PLAY_VOICEMAIL" ? "ANSWERING_MACHINE" : null,
        phoneNumber: phone(index).e164,
        startedAt,
        answeredAt: plan.status === "ANSWERED_HUMAN" || plan.status === "PLAY_VOICEMAIL" ? startedAt : null,
        humanMessageId: human.id,
        voicemailMessageId: voicemail.id,
        scheduledOutcome: plan.scheduled,
        nextTransitionAt: new Date(now.getTime() + 8000),
        isMock: true,
        isSeed: true,
        activeLeadKey: leadIds[index],
        events: {
          create: [
            { status: "QUEUED", message: "Queued for dialing (simulated, MOCK PROVIDER)", createdAt: new Date(startedAt.getTime() - 4000) },
            { status: plan.status, message: "Seeded active mock call", createdAt: startedAt },
          ],
        },
      },
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: "mock.forcedOutcome" },
    create: { key: "mock.forcedOutcome", value: { outcome: "RANDOM" } },
    update: {},
  });

  const calls = await prisma.call.count({ where: { isSeed: true } });
  console.log(`Seeded admin ${email}, 50 leads, 3 campaigns, ${calls} mock calls, and 2 audio messages.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
