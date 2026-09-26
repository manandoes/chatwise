-- CRM & integrations (2026-09-26). See docs/Memory.md for the reasoning.
--
-- pgvector holds the product-catalogue embeddings (products.embedding).
-- Supabase ships it; on a plain PostgreSQL install the postgresql-16-pgvector
-- package (or equivalent) must be present before this migration runs.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'AGENT');

-- CreateEnum
CREATE TYPE "OptInStatus" AS ENUM ('PENDING', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('MANUAL', 'RULE', 'IMPORT', 'SHOPIFY');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConversationPriority" AS ENUM ('NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('MENTION', 'ASSIGNED', 'URGENT');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('LEAD', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealActivityKind" AS ENUM ('CREATED', 'STAGE_CHANGED', 'VALUE_CHANGED', 'OWNER_CHANGED', 'NOTE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationKind" AS ENUM ('ORDER_CONFIRMED', 'ORDER_PAID', 'ORDER_SHIPPED', 'ABANDONED_CART', 'PAYMENT_LINK', 'PAYMENT_RECEIPT', 'PAYMENT_RETRY', 'REFUND_CONFIRMED', 'BOOKING_INVITE', 'BOOKING_CONFIRMED', 'BOOKING_REMINDER');

-- CreateEnum
CREATE TYPE "ExportFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "BookingProvider" AS ENUM ('CALENDLY', 'GOOGLE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProductSource" AS ENUM ('SHOPIFY', 'MANUAL');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "escalateUrgentToHuman" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "audienceBuiltAt" TIMESTAMP(3),
ADD COLUMN     "onlyOptedIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "segmentId" TEXT,
ADD COLUMN     "variableValues" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "priority" "ConversationPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "priorityReason" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryMessageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summaryUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "variables" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "language" TEXT,
ADD COLUMN     "sentiment" "Sentiment",
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "business_members" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invites" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'AGENT',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "language" TEXT,
    "totalSpent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "optInStatus" "OptInStatus" NOT NULL DEFAULT 'PENDING',
    "optInSource" TEXT,
    "optInAt" TIMESTAMP(3),
    "shopifyCustomerId" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "fromStatus" "OptInStatus",
    "toStatus" "OptInStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_jobs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "shopId" TEXT,
    "jobType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "lockedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_rules" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_notes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "conversationId" TEXT,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'LEAD',
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expectedClose" TIMESTAMP(3),
    "ownerId" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_activities" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "kind" "DealActivityKind" NOT NULL,
    "fromStage" "DealStage",
    "toStage" "DealStage",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "businessId" TEXT,
    "topic" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" BYTEA NOT NULL,
    "scopes" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "webhooksAt" TIMESTAMP(3),
    "webhookError" TEXT,
    "backfillStatus" TEXT,
    "backfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shopId" TEXT,
    "contactId" TEXT,
    "shopifyOrderId" TEXT,
    "orderNumber" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "trackingUrl" TEXT,
    "trackingNumber" TEXT,
    "checkoutToken" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_checkouts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "contactId" TEXT,
    "checkoutToken" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "recoveryUrl" TEXT,
    "convertedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_requests" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "result" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "keyId" TEXT,
    "secretKey" BYTEA NOT NULL,
    "webhookSecret" BYTEA,
    "webhookPathToken" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "contactId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerLinkId" TEXT,
    "providerPaymentId" TEXT,
    "linkUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "receiptToken" TEXT NOT NULL,
    "retryOfId" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_settings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "AutomationKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "delayMinutes" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "googleEmail" TEXT,
    "refreshToken" BYTEA NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_exports" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL DEFAULT 'Contacts',
    "segmentId" TEXT,
    "frequency" "ExportFrequency" NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'REPLACE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendly_connections" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingUrl" TEXT NOT NULL,
    "accessToken" BYTEA,
    "userUri" TEXT,
    "organizationUri" TEXT,
    "webhookUri" TEXT,
    "signingKey" BYTEA,
    "webhookPathToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendly_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT,
    "provider" "BookingProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventName" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "inviteeName" TEXT,
    "inviteeEmail" TEXT,
    "inviteePhone" TEXT,
    "cancelUrl" TEXT,
    "rescheduleUrl" TEXT,
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder1hSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" "ProductSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vendor" TEXT,
    "productType" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceMin" DECIMAL(14,2),
    "priceMax" DECIMAL(14,2),
    "currency" TEXT,
    "inventory" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "url" TEXT,
    "imageUrl" TEXT,
    "embedding" vector(768),
    "embeddedHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_members_userId_key" ON "business_members"("userId");

-- CreateIndex
CREATE INDEX "business_members_businessId_idx" ON "business_members"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_businessId_userId_key" ON "business_members"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invites_tokenHash_key" ON "team_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invites_businessId_idx" ON "team_invites"("businessId");

-- CreateIndex
CREATE INDEX "contacts_businessId_createdAt_idx" ON "contacts"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "contacts_businessId_shopifyCustomerId_idx" ON "contacts"("businessId", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "contacts_businessId_optInStatus_idx" ON "contacts"("businessId", "optInStatus");

-- CreateIndex
CREATE INDEX "contacts_importBatchId_idx" ON "contacts"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_businessId_phone_key" ON "contacts"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "tags_businessId_name_key" ON "tags"("businessId", "name");

-- CreateIndex
CREATE INDEX "contact_tags_businessId_idx" ON "contact_tags"("businessId");

-- CreateIndex
CREATE INDEX "contact_tags_tagId_idx" ON "contact_tags"("tagId");

-- CreateIndex
CREATE INDEX "consent_events_businessId_createdAt_idx" ON "consent_events"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "consent_events_contactId_createdAt_idx" ON "consent_events"("contactId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pending_jobs_dedupeKey_key" ON "pending_jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "pending_jobs_status_runAt_idx" ON "pending_jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "pending_jobs_businessId_status_idx" ON "pending_jobs"("businessId", "status");

-- CreateIndex
CREATE INDEX "pending_jobs_shopId_status_idx" ON "pending_jobs"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "segments_businessId_name_key" ON "segments"("businessId", "name");

-- CreateIndex
CREATE INDEX "tag_rules_businessId_idx" ON "tag_rules"("businessId");

-- CreateIndex
CREATE INDEX "conversation_notes_conversationId_createdAt_idx" ON "conversation_notes"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_notes_businessId_idx" ON "conversation_notes"("businessId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_businessId_idx" ON "notifications"("businessId");

-- CreateIndex
CREATE INDEX "deals_businessId_stage_position_idx" ON "deals"("businessId", "stage", "position");

-- CreateIndex
CREATE INDEX "deals_contactId_idx" ON "deals"("contactId");

-- CreateIndex
CREATE INDEX "deal_activities_dealId_createdAt_idx" ON "deal_activities"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "deal_activities_businessId_idx" ON "deal_activities"("businessId");

-- CreateIndex
CREATE INDEX "integration_events_businessId_receivedAt_idx" ON "integration_events"("businessId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_events_provider_externalId_key" ON "integration_events"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "shops_businessId_key" ON "shops"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "shops_shopDomain_key" ON "shops"("shopDomain");

-- CreateIndex
CREATE INDEX "orders_businessId_placedAt_idx" ON "orders"("businessId", "placedAt");

-- CreateIndex
CREATE INDEX "orders_contactId_idx" ON "orders"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shopId_shopifyOrderId_key" ON "orders"("shopId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "shopify_checkouts_businessId_createdAt_idx" ON "shopify_checkouts"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "shopify_checkouts_contactId_idx" ON "shopify_checkouts"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_checkouts_shopId_checkoutToken_key" ON "shopify_checkouts"("shopId", "checkoutToken");

-- CreateIndex
CREATE INDEX "compliance_requests_businessId_createdAt_idx" ON "compliance_requests"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_webhookPathToken_key" ON "payment_accounts"("webhookPathToken");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_businessId_provider_key" ON "payment_accounts"("businessId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptToken_key" ON "payments"("receiptToken");

-- CreateIndex
CREATE INDEX "payments_businessId_createdAt_idx" ON "payments"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_provider_providerPaymentId_idx" ON "payments"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "payments_contactId_idx" ON "payments"("contactId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerLinkId_key" ON "payments"("provider", "providerLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_settings_businessId_kind_key" ON "automation_settings"("businessId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_businessId_key" ON "google_connections"("businessId");

-- CreateIndex
CREATE INDEX "scheduled_exports_enabled_nextRunAt_idx" ON "scheduled_exports"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_exports_businessId_idx" ON "scheduled_exports"("businessId");

-- CreateIndex
CREATE INDEX "import_batches_businessId_createdAt_idx" ON "import_batches"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendly_connections_businessId_key" ON "calendly_connections"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "calendly_connections_webhookPathToken_key" ON "calendly_connections"("webhookPathToken");

-- CreateIndex
CREATE INDEX "bookings_businessId_startTime_idx" ON "bookings"("businessId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_status_startTime_idx" ON "bookings"("status", "startTime");

-- CreateIndex
CREATE INDEX "bookings_contactId_idx" ON "bookings"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_businessId_provider_providerEventId_key" ON "bookings"("businessId", "provider", "providerEventId");

-- CreateIndex
CREATE INDEX "products_businessId_idx" ON "products"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "products_businessId_source_externalId_key" ON "products"("businessId", "source", "externalId");

-- CreateIndex
CREATE INDEX "conversations_contactId_idx" ON "conversations"("contactId");

-- CreateIndex
CREATE INDEX "conversations_businessId_assignedToId_idx" ON "conversations"("businessId", "assignedToId");

-- CreateIndex
CREATE INDEX "conversations_businessId_priority_idx" ON "conversations"("businessId", "priority");

-- CreateIndex
CREATE INDEX "leads_contactId_idx" ON "leads"("contactId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "business_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_jobs" ADD CONSTRAINT "pending_jobs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_rules" ADD CONSTRAINT "tag_rules_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_rules" ADD CONSTRAINT "tag_rules_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "business_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_checkouts" ADD CONSTRAINT "shopify_checkouts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_checkouts" ADD CONSTRAINT "shopify_checkouts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_checkouts" ADD CONSTRAINT "shopify_checkouts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendly_connections" ADD CONSTRAINT "calendly_connections_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Nearest-neighbour search over the catalogue (lib/catalog.ts).
CREATE INDEX "products_embedding_idx" ON "products" USING hnsw ("embedding" vector_cosine_ops);

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- Everything below turns what already exists into the new shape. It only ever
-- adds rows and fills new, nullable columns; no existing value is changed.

-- 1. Every existing owner becomes the OWNER member of their own business.
INSERT INTO "business_members" ("id", "businessId", "userId", "role", "createdAt")
SELECT gen_random_uuid()::text, b."id", b."userId", 'OWNER', b."createdAt"
FROM "businesses" b
ON CONFLICT DO NOTHING;

-- 2. One contact per phone number a business has ever talked to, named from
--    the lead where the CRM agent (or a person) found a name, else from
--    WhatsApp.
INSERT INTO "contacts" ("id", "businessId", "phone", "name", "email", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."businessId", c."contactPhone",
       COALESCE(NULLIF(TRIM(l."name"), ''), c."contactName"),
       NULLIF(TRIM(l."email"), ''),
       c."createdAt", CURRENT_TIMESTAMP
FROM "conversations" c
LEFT JOIN "leads" l ON l."conversationId" = c."id"
ON CONFLICT ("businessId", "phone") DO NOTHING;

-- 3. People who opted out but have no thread (typed into a campaign, thread
--    since deleted) still need a contact to carry the opt-out.
INSERT INTO "contacts" ("id", "businessId", "phone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."businessId", o."contactPhone", o."createdAt", CURRENT_TIMESTAMP
FROM "opt_outs" o
ON CONFLICT ("businessId", "phone") DO NOTHING;

-- 4. Opt-outs become the contact's consent state, with an audit entry.
UPDATE "contacts" ct
SET "optInStatus" = 'OPTED_OUT', "optInSource" = 'whatsapp: replied STOP', "optInAt" = o."createdAt"
FROM "opt_outs" o
WHERE o."businessId" = ct."businessId" AND o."contactPhone" = ct."phone";

INSERT INTO "consent_events" ("id", "businessId", "contactId", "fromStatus", "toStatus", "source", "detail", "createdAt")
SELECT gen_random_uuid()::text, o."businessId", ct."id", 'PENDING', 'OPTED_OUT', 'whatsapp', o."reason", o."createdAt"
FROM "opt_outs" o
JOIN "contacts" ct ON ct."businessId" = o."businessId" AND ct."phone" = o."contactPhone";

-- 5. Point threads and leads at their contact.
UPDATE "conversations" c
SET "contactId" = ct."id"
FROM "contacts" ct
WHERE ct."businessId" = c."businessId" AND ct."phone" = c."contactPhone";

UPDATE "leads" l
SET "contactId" = c."contactId"
FROM "conversations" c
WHERE c."id" = l."conversationId";

-- 6. The free-text tags on threads and leads become real tags on the contact.
--    The old columns are left exactly as they were.
INSERT INTO "tags" ("id", "businessId", "name", "createdAt")
SELECT gen_random_uuid()::text, t."businessId", t."name", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT c."businessId", TRIM(u.tag) AS "name"
  FROM "conversations" c, UNNEST(c."tags") AS u(tag)
  UNION
  SELECT DISTINCT l."businessId", TRIM(u.tag) AS "name"
  FROM "leads" l, UNNEST(l."tags") AS u(tag)
) t
WHERE t."name" <> ''
ON CONFLICT ("businessId", "name") DO NOTHING;

INSERT INTO "contact_tags" ("contactId", "tagId", "businessId", "source", "createdAt")
SELECT DISTINCT c."contactId", tg."id", c."businessId", 'MANUAL'::"TagSource", CURRENT_TIMESTAMP
FROM "conversations" c, UNNEST(c."tags") AS u(tag)
JOIN "tags" tg ON TRUE
WHERE tg."businessId" = c."businessId" AND tg."name" = TRIM(u.tag) AND c."contactId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "contact_tags" ("contactId", "tagId", "businessId", "source", "createdAt")
SELECT DISTINCT l."contactId", tg."id", l."businessId", 'MANUAL'::"TagSource", CURRENT_TIMESTAMP
FROM "leads" l, UNNEST(l."tags") AS u(tag)
JOIN "tags" tg ON TRUE
WHERE tg."businessId" = l."businessId" AND tg."name" = TRIM(u.tag) AND l."contactId" IS NOT NULL
ON CONFLICT DO NOTHING;
