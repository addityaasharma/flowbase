import webpush from "web-push";
import { prisma } from "./db";

/**
 * Web Push: a notification that reaches a person's phone or computer even when Flowbase is closed. Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
 * VAPID_SUBJECT in the environment; without them everything here quietly does nothing (development, tests).
 */
export type PushPayload = { title: string; body: string; url: string; tag?: string };
type Sub = { endpoint: string; p256dh: string; auth: string };
export type PushSender = (sub: Sub, payload: PushPayload) => Promise<void>;

export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const publicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

let configured = false;
const realSender: PushSender = async (sub, payload) => {
  if (!configured) { webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://example.invalid", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!); configured = true; }
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 24 * 3600, urgency: "normal" });
};
let sender: PushSender = realSender;
let forced = false;
export const setPushSender = (s: PushSender | null) => { sender = s ?? realSender; forced = !!s; }; // tests

/** Sends to every device of the given people. A device that no longer exists (uninstalled, permission revoked) is forgotten. Never throws. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length || (!pushEnabled() && !forced)) return 0;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try { await sender(s, payload); sent++; }
      catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } }).catch(() => {});
        else console.warn("[push] send failed", e?.statusCode ?? e?.message ?? e);
      }
    }));
    return sent;
  } catch (e) { console.error("[push] failed", e); return 0; }
}
