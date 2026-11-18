import { prisma } from "./db";
import { notify } from "./notifications";
import { sendReminderEmail } from "./mail";

const DAY = 86_400_000;
const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Due-date reminders for people assigned to open tickets (days are UTC):
 *  - "due-soon": the day before the due date   - "overdue": the day after it passes (once)
 * Each reminder is sent once per due date: the Reminder table remembers it, changing the due date re-arms it.
 */
export async function sendDueReminders(): Promise<{ sent: number }> {
  const today = startOfUtcDay();
  const tomorrow = new Date(+today + DAY), dayAfter = new Date(+today + 2 * DAY);
  const tickets = await prisma.ticket.findMany({
    where: { status: { not: "DONE" }, dueDate: { not: null, lt: dayAfter, gte: new Date(+today - 14 * DAY) } }, // ignore things overdue for more than two weeks
    include: { project: { select: { id: true, name: true, key: true } }, assignees: { select: { user: { select: { id: true, name: true, email: true, active: true } } } } },
  });
  let sent = 0;
  for (const t of tickets) {
    if (!t.dueDate || !t.assignees.length) continue;
    const kind: "due-soon" | "overdue" | null = t.dueDate < today ? "overdue" : t.dueDate >= tomorrow ? "due-soon" : null; // due today: no extra reminder
    if (!kind) continue;
    try { await prisma.reminder.create({ data: { ticketId: t.id, kind, dueDate: t.dueDate } }); } catch { continue; } // unique violation = already sent
    const key = `${t.project.key}-${t.number}`;
    const when = t.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const people = t.assignees.map((a) => a.user).filter((u) => u.active);
    await notify({ userIds: people.map((u) => u.id), kind: "due", text: kind === "overdue" ? `${key} “${t.title}” is overdue (was due ${when})` : `${key} “${t.title}” is due tomorrow (${when})`, projectId: t.project.id, ticketId: t.id });
    for (const u of people) {
      sendReminderEmail({ to: u.email, name: u.name, kind, ticket: { key, title: t.title, due: when }, project: t.project.name, link: `${(process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "")}/?ticket=${t.id}` })
        .then((r) => { if (!r.sent) console.warn(`[mail] reminder to ${u.email} not sent: ${r.error}`); }).catch(console.error);
      sent++;
    }
  }
  return { sent };
}

/** Hourly, plus shortly after start-up. */
export function startReminderJob() {
  const run = () => sendDueReminders().then((r) => { if (r.sent) console.log(`[reminders] sent ${r.sent}`); }).catch((e) => console.error("[reminders] failed", e));
  setTimeout(run, 90_000).unref();
  setInterval(run, 3600_000).unref();
}
