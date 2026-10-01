-- CreateEnum
CREATE TYPE "LeadActivity" AS ENUM ('NEW', 'IN_PROGRESS', 'IDLE');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('SUCCESSFUL', 'VOICEMAIL', 'NO_ANSWER', 'BUSY', 'FAILED', 'IN_PROGRESS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnswerType" AS ENUM ('ANSWERED_HUMAN', 'ANSWERING_MACHINE', 'NO_ANSWER', 'BUSY', 'FAILED');

-- CreateEnum
CREATE TYPE "CallLifecycleStatus" AS ENUM ('QUEUED', 'DIALING', 'RINGING', 'ANSWERED_HUMAN', 'PLAY_HUMAN_MESSAGE', 'ANSWERING_MACHINE', 'PLAY_VOICEMAIL', 'NO_ANSWER', 'BUSY', 'FAILED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignLeadStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('HUMAN_ANSWER', 'VOICEMAIL');

-- CreateEnum
CREATE TYPE "ForcedOutcome" AS ENUM ('ANSWERED', 'VOICEMAIL', 'NO_ANSWER', 'BUSY', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "duplicateRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "preview" JSONB NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "extra" JSONB,
    "importId" TEXT,
    "activity" "LeadActivity" NOT NULL DEFAULT 'NEW',
    "callAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastCallAt" TIMESTAMP(3),
    "lastCallStatus" "CallOutcome",
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "filter" JSONB NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "retryNoAnswer" BOOLEAN NOT NULL DEFAULT false,
    "retryBusy" BOOLEAN NOT NULL DEFAULT false,
    "retryFailed" BOOLEAN NOT NULL DEFAULT false,
    "forcedOutcome" "ForcedOutcome",
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "humanMessageId" TEXT,
    "voicemailMessageId" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "CampaignLeadStatus" NOT NULL DEFAULT 'PENDING',
    "lastOutcome" "CallOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT,
    "provider" TEXT NOT NULL,
    "providerCallId" TEXT,
    "status" "CallLifecycleStatus" NOT NULL,
    "outcome" "CallOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "answerType" "AnswerType",
    "phoneNumber" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "humanMessageId" TEXT,
    "voicemailMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "scheduledOutcome" "ForcedOutcome",
    "nextTransitionAt" TIMESTAMP(3),
    "isMock" BOOLEAN NOT NULL DEFAULT true,
    "activeLeadKey" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "status" "CallLifecycleStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioMessage" (
    "id" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LeadImport_createdAt_idx" ON "LeadImport"("createdAt");

-- CreateIndex
CREATE INDEX "LeadImport_status_idx" ON "LeadImport"("status");

-- CreateIndex
CREATE INDEX "LeadImport_createdById_idx" ON "LeadImport"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phoneNormalized_key" ON "Lead"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_lastCallAt_idx" ON "Lead"("lastCallAt");

-- CreateIndex
CREATE INDEX "Lead_lastCallStatus_idx" ON "Lead"("lastCallStatus");

-- CreateIndex
CREATE INDEX "Lead_activity_idx" ON "Lead"("activity");

-- CreateIndex
CREATE INDEX "Lead_importId_idx" ON "Lead"("importId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "Campaign_humanMessageId_idx" ON "Campaign"("humanMessageId");

-- CreateIndex
CREATE INDEX "Campaign_voicemailMessageId_idx" ON "Campaign"("voicemailMessageId");

-- CreateIndex
CREATE INDEX "CampaignLead_campaignId_status_idx" ON "CampaignLead"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignLead_leadId_idx" ON "CampaignLead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignLead_campaignId_leadId_key" ON "CampaignLead"("campaignId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_activeLeadKey_key" ON "Call"("activeLeadKey");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_outcome_idx" ON "Call"("outcome");

-- CreateIndex
CREATE INDEX "Call_campaignId_idx" ON "Call"("campaignId");

-- CreateIndex
CREATE INDEX "Call_leadId_idx" ON "Call"("leadId");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "Call"("startedAt");

-- CreateIndex
CREATE INDEX "Call_nextTransitionAt_idx" ON "Call"("nextTransitionAt");

-- CreateIndex
CREATE INDEX "Call_humanMessageId_idx" ON "Call"("humanMessageId");

-- CreateIndex
CREATE INDEX "Call_voicemailMessageId_idx" ON "Call"("voicemailMessageId");

-- CreateIndex
CREATE INDEX "CallEvent_callId_createdAt_idx" ON "CallEvent"("callId", "createdAt");

-- CreateIndex
CREATE INDEX "AudioMessage_kind_isActive_idx" ON "AudioMessage"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "LeadImport" ADD CONSTRAINT "LeadImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_importId_fkey" FOREIGN KEY ("importId") REFERENCES "LeadImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_humanMessageId_fkey" FOREIGN KEY ("humanMessageId") REFERENCES "AudioMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_voicemailMessageId_fkey" FOREIGN KEY ("voicemailMessageId") REFERENCES "AudioMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_humanMessageId_fkey" FOREIGN KEY ("humanMessageId") REFERENCES "AudioMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_voicemailMessageId_fkey" FOREIGN KEY ("voicemailMessageId") REFERENCES "AudioMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
