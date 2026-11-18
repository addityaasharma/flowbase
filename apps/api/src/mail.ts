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

export function sendInviteEmail(opts: { to: string; link: string; inviter: string; project?: string | null }) {
  const where = opts.project ? ` to join <b>${esc(opts.project)}</b>` : "";
  const html = shell("You're invited to Flowbase",
    `<p style="color:#6e6e73;line-height:1.5"><b>${esc(opts.inviter)}</b> invited you${where} on Flowbase.</p>${button(opts.link, "Accept invitation")}
     <p style="color:#86868b;font-size:13px">This link expires in 7 days and can be used once. If the button doesn't work, paste this into your browser:<br>${opts.link}</p>`,
    "If you weren't expecting this, you can ignore this email.");
  return deliver(opts.to, "You're invited to Flowbase", html, opts.link);
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

export function sendAssignmentEmail(o: AssignmentMail) {
  const { subject, html } = renderAssignmentEmail(o);
  return deliver(o.to, subject, html, o.link);
}
