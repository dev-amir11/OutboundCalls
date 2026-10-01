-- CreateEnum
CREATE TYPE "LiveKitDeskStatus" AS ENUM ('DIALING', 'RINGING', 'TALKING', 'ENDED', 'FAILED');

-- CreateTable
CREATE TABLE "LiveKitSession" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "phoneDisplay" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "dialed" TEXT NOT NULL,
    "status" "LiveKitDeskStatus" NOT NULL DEFAULT 'DIALING',
    "detail" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "LiveKitSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveKitSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveKitSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveKitSession_roomName_key" ON "LiveKitSession"("roomName");

-- CreateIndex
CREATE INDEX "LiveKitSession_startedAt_idx" ON "LiveKitSession"("startedAt");

-- CreateIndex
CREATE INDEX "LiveKitSession_status_idx" ON "LiveKitSession"("status");

-- CreateIndex
CREATE INDEX "LiveKitSession_createdById_idx" ON "LiveKitSession"("createdById");

-- CreateIndex
CREATE INDEX "LiveKitSessionEvent_sessionId_createdAt_idx" ON "LiveKitSessionEvent"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "LiveKitSession" ADD CONSTRAINT "LiveKitSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveKitSessionEvent" ADD CONSTRAINT "LiveKitSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveKitSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
