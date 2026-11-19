const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type MailResult = { sent: boolean; error?: string };

/** Sends through Resend's HTTP API. Without RESEND_API_KEY it only logs (dev fallback), so local tests never email anyone. */
async function deliver(to: string, subject: string, html: string, devNote: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] RESEND_API_KEY not set — would send to ${to}: "${subject}" ${devNote}`);
    return { sent: false, error: "Email is not configured (RESEND_API_KEY missing)" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "Flowbase <onboarding@resend.dev>", to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { sent: false, error: body.message ?? `Resend error ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}

const shell = (title: string, inner: string, footer: string) => `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;padding:32px;color:#1d1d1f">
  <h2 style="margin:0 0 12px;font-size:22px">${title}</h2>${inner}
  <p style="color:#86868b;font-size:12px;margin-top:28px">${footer}</p></div>`;
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#0071e3;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">${label}</a></p>`;

let lastAlert = 0;
/** Emails ALERT_EMAIL about an unexpected server error (at most one per 10 minutes; only the route, never request data). */
export async function alertError(where: string, err: unknown) {
  const to = process.env.ALERT_EMAIL;
  if (!to || Date.now() - lastAlert < 10 * 60_000) return;
  lastAlert = Date.now();
  const msg = err instanceof Error ? `${err.name}: ${err.message}\n${(err.stack ?? "").split("\n").slice(1, 7).join("\n")}` : String(err);
  await deliver(to, `[Flowbase] server error in ${where}`, `<p>An unexpected error happened on the server.</p><p><b>${esc(where)}</b></p><pre style="font-size:12px;white-space:pre-wrap">${esc(msg)}</pre>`, where);
}

export function sendInviteEmail(opts: { to: string; link: string; inviter: string; project?: string | null }) {
  const where = opts.project ? ` to join <b>${esc(opts.project)}</b>` : "";
  const html = shell("You're invited to Flowbase",
    `<p style="color:#6e6e73;line-height:1.5"><b>${esc(opts.inviter)}</b> invited you${where} on Flowbase.</p>${button(opts.link, "Accept invitation")}
     <p style="color:#86868b;font-size:13px">This link expires in 7 days and can be used once. If the button doesn't work, paste this into your browser:<br>${opts.link}</p>`,
    "If you weren't expecting this, you can ignore this email.");
  return deliver(opts.to, "You're invited to Flowbase", html, opts.link);
}

export function sendPasswordResetEmail(o: { to: string; name: string; link: string }) {
  const html = shell("Reset your Flowbase password",
    `<p style="color:#6e6e73;line-height:1.5">Hi ${esc(o.name.split(" ")[0])}, we received a request to reset your password.</p>${button(o.link, "Choose a new password")}
     <p style="color:#86868b;font-size:13px">This link works once and expires in 1 hour. If the button doesn't work, paste this into your browser:<br>${o.link}</p>`,
    "If you didn't ask for this, you can ignore this email. Your password won't change.");
  return deliver(o.to, "Reset your Flowbase password", html, o.link);
}

export function sendVerifyEmail(o: { to: string; name: string; link: string }) {
  const html = shell("Confirm your email address",
    `<p style="color:#6e6e73;line-height:1.5">Welcome to Flowbase, ${esc(o.name.split(" ")[0])}! Please confirm this is your email so you can create projects and invite teammates.</p>${button(o.link, "Confirm email")}
     <p style="color:#86868b;font-size:13px">This link expires in 3 days. If the button doesn't work, paste this into your browser:<br>${o.link}</p>`,
    "If you didn't create a Flowbase account, you can ignore this email.");
  return deliver(o.to, "Confirm your Flowbase email", html, o.link);
}

export type AssignmentMail = {
  to: string; name: string; actor: string; link: string; project: string;
  ticket: { key: string; title: string; priority: string; status: string; dueDate: Date | null };
};

export function renderAssignmentEmail(o: AssignmentMail) {
  const subject = `${o.actor} assigned you ${o.ticket.key}: ${o.ticket.title}`.slice(0, 150);
  const row = (k: string, v: string) => `<tr><td style="padding:4px 16px 4px 0;color:#86868b">${k}</td><td style="padding:4px 0;font-weight:500">${esc(v)}</td></tr>`;
  const due = o.ticket.dueDate ? o.ticket.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
  const html = shell("A new task has been assigned to you",
    `<p style="color:#6e6e73;line-height:1.5">Hi ${esc(o.name.split(" ")[0])}, <b>${esc(o.actor)}</b> assigned you a task in <b>${esc(o.project)}</b>.</p>
     <div style="background:#f5f5f7;border-radius:16px;padding:16px 18px;margin:16px 0">
       <div style="color:#86868b;font-size:12px;font-weight:600">${esc(o.ticket.key)}</div>
       <div style="font-size:17px;font-weight:600;margin:2px 0 10px">${esc(o.ticket.title)}</div>
       <table style="font-size:14px;border-collapse:collapse">${row("Priority", o.ticket.priority)}${row("Status", o.ticket.status)}${due ? row("Due", due) : ""}</table>
     </div>${button(o.link, "Open task")}`,
    `You're receiving this because you're a member of ${esc(o.project)} on Flowbase.`);
  return { subject, html };
}

export function sendMentionEmail(o: { to: string; name: string; actor: string; project: string; ticket: { key: string; title: string }; excerpt: string; link: string }) {
  const html = shell(`${esc(o.actor)} mentioned you`,
    `<p style="color:#6e6e73;line-height:1.5">Hi ${esc(o.name.split(" ")[0])}, you were mentioned on <b>${esc(o.ticket.key)} “${esc(o.ticket.title)}”</b> in ${esc(o.project)}.</p>
     <div style="background:#f5f5f7;border-radius:16px;padding:14px 18px;margin:16px 0;font-size:14px;color:#1d1d1f">“${esc(o.excerpt)}”</div>${button(o.link, "Open task")}`,
    `You're receiving this because someone mentioned you on Flowbase.`);
  return deliver(o.to, `${o.actor} mentioned you on ${o.ticket.key}`.slice(0, 150), html, o.link);
}

export function sendReminderEmail(o: { to: string; name: string; kind: "due-soon" | "overdue"; ticket: { key: string; title: string; due: string }; project: string; link: string }) {
  const overdue = o.kind === "overdue";
  const html = shell(overdue ? "A task is overdue" : "A task is due tomorrow",
    `<p style="color:#6e6e73;line-height:1.5">Hi ${esc(o.name.split(" ")[0])}, ${overdue ? "this task you're assigned to has passed its due date" : "this task you're assigned to is due tomorrow"}.</p>
     <div style="background:#f5f5f7;border-radius:16px;padding:16px 18px;margin:16px 0">
       <div style="color:#86868b;font-size:12px;font-weight:600">${esc(o.ticket.key)} · ${esc(o.project)}</div>
       <div style="font-size:17px;font-weight:600;margin:2px 0 6px">${esc(o.ticket.title)}</div>
       <div style="font-size:14px;color:${overdue ? "#d70015" : "#1d1d1f"}">Due ${esc(o.ticket.due)}</div>
     </div>${button(o.link, "Open task")}`,
    `You're receiving this because you're assigned to this task on Flowbase.`);
  return deliver(o.to, `${overdue ? "Overdue" : "Due tomorrow"}: ${o.ticket.key} ${o.ticket.title}`.slice(0, 150), html, o.link);
}

export function sendAssignmentEmail(o: AssignmentMail) {
  const { subject, html } = renderAssignmentEmail(o);
  return deliver(o.to, subject, html, o.link);
}

export function sendSubtaskReminderEmail(o: { to: string; name: string; actor: string; project: string; ticket: { key: string; title: string }; subtask: string; link: string }) {
  const html = shell("Reminder: a subtask is waiting on you",
    `<p style="color:#6e6e73;line-height:1.5">Hi ${esc(o.name.split(" ")[0])}, ${esc(o.actor)} is reminding you about a subtask assigned to you.</p>
     <div style="background:#f5f5f7;border-radius:16px;padding:16px 18px;margin:16px 0">
       <div style="color:#86868b;font-size:12px;font-weight:600">${esc(o.ticket.key)} · ${esc(o.project)}</div>
       <div style="font-size:14px;color:#6e6e73;margin-top:2px">${esc(o.ticket.title)}</div>
       <div style="font-size:17px;font-weight:600;margin-top:6px">☐ ${esc(o.subtask)}</div>
     </div>${button(o.link, "Open task")}`,
    `You're receiving this because a subtask is assigned to you on Flowbase.`);
  return deliver(o.to, `Reminder: ${o.subtask} (${o.ticket.key})`.slice(0, 150), html, o.link);
}
