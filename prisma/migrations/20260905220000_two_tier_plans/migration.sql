-- Two plans, one per connection tier.
--
-- The plan ladder (Free / Starter / Growth / Pro) is gone. A business buys the
-- way it connects to WhatsApp and nothing else: SMALL_BUSINESS is the QR
-- connection, ENTERPRISE is the official Business API. Both are paid; NONE is
-- an account with no live subscription, which is where a new account starts and
-- where a cancellation lands.
--
-- Existing rows are mapped rather than dropped, so this is safe to run against a
-- database that already has subscriptions in it:
--
--   FREE    -> NONE            (was already "not paying for anything")
--   STARTER -> SMALL_BUSINESS  (was the QR-connection plan)
--   GROWTH  -> ENTERPRISE      (was the cheapest plan allowing the API)
--   PRO     -> ENTERPRISE      (the other API plan; there is now only one)
--
-- Anyone previously on PRO keeps the API connection they were paying for. Their
-- Razorpay subscription still points at the old PRO plan id, so re-point those
-- subscriptions at the ENTERPRISE plan in the Razorpay dashboard — this
-- migration moves entitlement, and only Razorpay can move what is charged.

-- The default has to go before the type can be swapped underneath the column.
ALTER TABLE "subscriptions" ALTER COLUMN "plan" DROP DEFAULT;

CREATE TYPE "PlanId_new" AS ENUM ('NONE', 'SMALL_BUSINESS', 'ENTERPRISE');

ALTER TABLE "subscriptions"
  ALTER COLUMN "plan" TYPE "PlanId_new"
  USING (
    CASE "plan"::text
      WHEN 'STARTER' THEN 'SMALL_BUSINESS'
      WHEN 'GROWTH'  THEN 'ENTERPRISE'
      WHEN 'PRO'     THEN 'ENTERPRISE'
      ELSE 'NONE'
    END
  )::"PlanId_new";

-- Nullable: null means "no pending change", which is not the same as NONE.
ALTER TABLE "subscriptions"
  ALTER COLUMN "pendingPlan" TYPE "PlanId_new"
  USING (
    CASE "pendingPlan"::text
      WHEN 'STARTER' THEN 'SMALL_BUSINESS'
      WHEN 'GROWTH'  THEN 'ENTERPRISE'
      WHEN 'PRO'     THEN 'ENTERPRISE'
      WHEN 'FREE'    THEN 'NONE'
      ELSE NULL
    END
  )::"PlanId_new";

DROP TYPE "PlanId";
ALTER TYPE "PlanId_new" RENAME TO "PlanId";

ALTER TABLE "subscriptions" ALTER COLUMN "plan" SET DEFAULT 'NONE';
