-- DropIndex
DROP INDEX "products_embedding_idx";

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "firstHumanResponseAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "addons" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "conversations_businessId_escalatedAt_priority_idx" ON "conversations"("businessId", "escalatedAt", "priority");
