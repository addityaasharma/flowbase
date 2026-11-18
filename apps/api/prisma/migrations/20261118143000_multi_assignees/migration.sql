-- Tickets can have several assignees. Existing single assignees are carried over, then the old column is dropped.

-- CreateTable
CREATE TABLE "TicketAssignee" (
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAssignee_pkey" PRIMARY KEY ("ticketId","userId")
);

-- CreateIndex
CREATE INDEX "TicketAssignee_userId_idx" ON "TicketAssignee"("userId");

-- AddForeignKey
ALTER TABLE "TicketAssignee" ADD CONSTRAINT "TicketAssignee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignee" ADD CONSTRAINT "TicketAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over existing assignees (data-preserving)
INSERT INTO "TicketAssignee" ("ticketId", "userId")
SELECT "id", "assigneeId" FROM "Ticket" WHERE "assigneeId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_assigneeId_fkey";

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "assigneeId";
