import { prisma } from "./db";
import { sendToUser } from "./events";

/**
 * Saves an inbox entry for each recipient (so people who are offline still see it) and pushes it live to anyone online.
 * The person who caused the event is never notified about their own action.
 */
export async function notify(o: {
  userIds: string[]; actor?: { id: string; name: string } | null; kind: string; text: string; projectId?: string; ticketId?: string | null;
}) {
  const ids = [...new Set(o.userIds)].filter((id) => id !== o.actor?.id);
  if (!ids.length) return;
  const rows = await prisma.notification.createManyAndReturn({
    data: ids.map((userId) => ({
      userId, actorId: o.actor?.id ?? null, actorName: o.actor?.name ?? null, kind: o.kind, text: o.text,
      projectId: o.projectId ?? null, ticketId: o.ticketId ?? null,
    })),
  });
  for (const r of rows) sendToUser(r.userId, "notification", r);
}

/** The people a ticket concerns: its assignees and its creator. */
export async function ticketAudience(ticketId: string): Promise<string[]> {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { reporterId: true, assignees: { select: { userId: true } } } });
  return t ? [t.reporterId, ...t.assignees.map((a) => a.userId)] : [];
}
