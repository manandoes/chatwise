-- CreateTable
CREATE TABLE "whatsapp_api_credentials" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT,
    "displayPhoneNumber" TEXT,
    "accessToken" BYTEA NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_api_credentials_connectionId_key" ON "whatsapp_api_credentials"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_api_credentials_phoneNumberId_key" ON "whatsapp_api_credentials"("phoneNumberId");

-- AddForeignKey
ALTER TABLE "whatsapp_api_credentials" ADD CONSTRAINT "whatsapp_api_credentials_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
