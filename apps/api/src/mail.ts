const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type MailResult = { sent: boolean; error?: string };

/** Sends the invite through Resend's HTTP API. Without RESEND_API_KEY it only logs the link (dev fallback). */
export async function sendInviteEmail(opts: { to: string; link: string; inviter: string; project?: string | null }): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] RESEND_API_KEY not set — invite link for ${opts.to}: ${opts.link}`);
    return { sent: false, error: "Email is not configured (RESEND_API_KEY missing)" };
  }
  const where = opts.project ? ` to join <b>${esc(opts.project)}</b>` : "";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;padding:32px;color:#1d1d1f">
    <h2 style="margin:0 0 8px;font-size:22px">You're invited to Bitcode Tracker</h2>
    <p style="color:#6e6e73;line-height:1.5"><b>${esc(opts.inviter)}</b> invited you${where} on the Bitcode Software workspace.</p>
    <p style="margin:28px 0"><a href="${opts.link}" style="background:#0071e3;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Accept invitation</a></p>
    <p style="color:#86868b;font-size:13px">This link expires in 7 days and can be used once. If the button doesn't work, paste this into your browser:<br>${opts.link}</p></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Bitcode Tracker <onboarding@resend.dev>",
        to: [opts.to], subject: "You're invited to Bitcode Tracker", html,
      }),
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
