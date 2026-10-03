-- CreateEnum
CREATE TYPE "AgentLogKind" AS ENUM ('ROUTED', 'HANDOFF', 'ESCALATE_TO_HUMAN', 'TOOL_CALL', 'REPLY_GENERATED', 'FAILURE', 'HUMAN_TAKEOVER', 'HUMAN_RELEASED');

-- AlterTable
ALTER TABLE "agent_instances" ADD COLUMN     "activeBotType" "BotType",
ADD COLUMN     "enabledAgents" JSONB NOT NULL DEFAULT '["RECEPTIONIST"]';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "autoBackupMediaToDrive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoBackupToDrive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backupDriveFileId" TEXT,
ADD COLUMN     "lastBackupAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "currentAgent" "BotType",
ADD COLUMN     "handoffCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "mediaMimeType" TEXT,
ADD COLUMN     "mediaType" TEXT,
ADD COLUMN     "mediaUrl" TEXT;

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" "AgentLogKind" NOT NULL,
    "agent" "BotType",
    "note" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_logs_businessId_createdAt_idx" ON "agent_logs"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_logs_conversationId_createdAt_idx" ON "agent_logs"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_logs_businessId_kind_createdAt_idx" ON "agent_logs"("businessId", "kind", "createdAt");
