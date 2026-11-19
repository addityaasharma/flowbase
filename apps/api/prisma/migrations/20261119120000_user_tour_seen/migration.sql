-- AlterTable
ALTER TABLE "User" ADD COLUMN "tourSeenAt" TIMESTAMP(3);
-- people who already have an account are not shown the welcome tour
UPDATE "User" SET "tourSeenAt" = NOW();
