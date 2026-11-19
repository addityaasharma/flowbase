/** An overdue task that sits in Blocked is frozen: only the person who created it may unblock it or change its due date. */
export const OVERDUE_LOCK_MSG = "This task is overdue and blocked. Only the person who created it can unblock it or change its due date.";
export function overdueBlocked(t: { status: string; dueDate: Date | null }, now = new Date()): boolean {
  if (t.status !== "BLOCKED" || !t.dueDate) return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return t.dueDate < today;
}
