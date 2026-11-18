-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_ticketId_kind_dueDate_key" ON "Reminder"("ticketId", "kind", "dueDate");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
