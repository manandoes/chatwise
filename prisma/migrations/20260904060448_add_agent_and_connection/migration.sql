-- CreateEnum
CREATE TYPE "BotType" AS ENUM ('RECEPTIONIST', 'LEAD_QUALIFIER', 'APPOINTMENT', 'SALES', 'SUPPORT', 'FOLLOW_UP', 'PERSONAL_SHOPPER', 'FEEDBACK', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('QR', 'API');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'ERROR');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ALTER COLUMN "name" DROP NOT NULL;

-- CreateTable
CREATE TABLE "agent_instances" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "botType" "BotType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "tone" TEXT,
    "language" TEXT,
    "escalationRules" TEXT,
    "escalateTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "ConnectionType" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "phoneNumber" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_instances_businessId_key" ON "agent_instances"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_businessId_key" ON "whatsapp_connections"("businessId");

-- AddForeignKey
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
