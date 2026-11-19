-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN "assigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "remindedAt" TIMESTAMP(3);
UPDATE "Subtask" SET "assigneeIds" = ARRAY["assigneeId"] WHERE "assigneeId" IS NOT NULL;
ALTER TABLE "Subtask" ALTER COLUMN "assigneeIds" SET NOT NULL, DROP COLUMN "assigneeId";
