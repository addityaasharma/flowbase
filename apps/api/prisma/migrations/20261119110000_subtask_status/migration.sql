-- CreateEnum
CREATE TYPE "SubtaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');

-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN "status" "SubtaskStatus" NOT NULL DEFAULT 'TODO';
UPDATE "Subtask" SET "status" = 'DONE' WHERE "done" = true;
