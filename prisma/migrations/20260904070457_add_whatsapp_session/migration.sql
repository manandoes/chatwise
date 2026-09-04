-- AlterTable
ALTER TABLE "whatsapp_connections" ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "messagesReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messagesSent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_connectionId_key" ON "whatsapp_sessions"("connectionId");

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
