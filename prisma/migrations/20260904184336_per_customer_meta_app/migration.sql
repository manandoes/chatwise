-- Every customer now brings their own Meta app, so the app secret and the
-- webhook tokens belong to the customer rather than to the platform.
--
-- The table is empty at this point (no customer has connected the Business API
-- yet), so the new columns can be added as required without a backfill.

-- AlterTable
ALTER TABLE "whatsapp_api_credentials"
  ADD COLUMN "appId" TEXT,
  ADD COLUMN "appSecret" BYTEA NOT NULL,
  ADD COLUMN "webhookPathToken" TEXT NOT NULL,
  ADD COLUMN "webhookVerifyToken" TEXT NOT NULL,
  ADD COLUMN "webhookVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_api_credentials_webhookPathToken_key"
  ON "whatsapp_api_credentials"("webhookPathToken");
