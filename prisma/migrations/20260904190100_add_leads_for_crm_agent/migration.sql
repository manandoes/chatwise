-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'INTERESTED', 'QUALIFIED', 'NOT_A_FIT', 'CUSTOMER');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "nextStep" TEXT,
    "notes" TEXT,
    "fieldsEditedByHuman" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "letTheAgentUpdateThis" BOOLEAN NOT NULL DEFAULT false,
    "lastAgentUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_conversationId_key" ON "leads"("conversationId");

-- CreateIndex
CREATE INDEX "leads_businessId_updatedAt_idx" ON "leads"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "leads_businessId_status_idx" ON "leads"("businessId", "status");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
