-- Phase 9: a person can take a thread over from the inbox.
--
-- `escalatedBy` says which of the two kinds of quiet this is — the agent asking
-- for help, or somebody having already stepped in. `unreadCount` is what the
-- inbox shows as new; it is a stored counter rather than a per-thread query
-- because the list shows a hundred threads at once.
--
-- Named 190200 rather than the clock's own time: it has to sort after
-- 20260904190000_conversations_messages_knowledge_base, which creates the table
-- it alters, or a fresh database can never be built from these files.

-- CreateEnum
CREATE TYPE "HandoverSource" AS ENUM ('AGENT', 'HUMAN');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "escalatedBy" "HandoverSource",
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;
