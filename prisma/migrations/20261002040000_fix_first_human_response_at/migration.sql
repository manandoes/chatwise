-- This migration fixes the firstHumanResponseAt column that was accidentally
-- added to "businesses" in the previous migration — it belongs on "conversations".
-- It is idempotent: runs clean even if the column is already in the right place.

-- Remove the stray column from the wrong table.
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "firstHumanResponseAt";

-- Add the column to the correct table (the index migration was already applied).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "firstHumanResponseAt" TIMESTAMP(3);
