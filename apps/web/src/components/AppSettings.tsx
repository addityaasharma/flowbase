"use client";
import { useEffect, useState } from "react";
import { BellRing, Download, Smartphone, Volume2, VolumeX } from "lucide-react";
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported, useInstall } from "@/lib/pwa";
import { beep, setSoundEnabled, soundEnabled } from "@/lib/realtime";
import { btnGhost, btnPrimary } from "./Bits";

/** Profile card: install Flowbase as an app, and turn on notifications that arrive even when it is closed. */
export function AppSettings() {
  const { canInstall, install } = useInstall();
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "none">("none");
  const supported = ready && pushSupported();
  const iosNeedsInstall = ready && isIos() && !isStandalone(); // iPhone/iPad only allow push for apps added to the Home Screen
  useEffect(() => {
    setReady(true); setSound(soundEnabled());
    if (pushSupported()) { setPerm(Notification.permission); currentSubscription().then((s) => setOn(!!s && Notification.permission === "granted")).catch(() => {}); }
  }, []);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); if (pushSupported()) setPerm(Notification.permission); }
  };
  return (
    <section className="min-w-0 rounded-[28px] bg-white p-4 shadow-card sm:p-5">
      <h3 className="font-semibold">App and notifications</h3>
      <p className="mt-0.5 text-xs text-slate-500">Install Flowbase on this device and get notified even when it is closed.</p>

      <div className="mt-3 space-y-3">
        {isStandalone() ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700"><Smartphone className="h-4 w-4" />Flowbase is installed on this device.</p>
        ) : canInstall ? (
          <button type="button" className={btnPrimary + " w-full sm:w-auto"} onClick={() => install()}><Download className="h-4 w-4" />Install the app</button>
        ) : isIos() ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">To install: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</p>
        ) : (
          <p className="text-xs text-slate-400">To install, use your browser’s menu: “Install app” or “Add to Home screen”.</p>
        )}

        {!ready ? null : iosNeedsInstall ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">On iPhone and iPad, notifications work after you add Flowbase to the Home Screen and open it from there.</p>
        ) : !supported ? (
          <p className="text-xs text-slate-400">This browser can’t show push notifications.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {on ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><BellRing className="h-4 w-4" />Notifications are on</span>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => run(async () => { await disablePush(); setOn(false); }, "Notifications are off on this device.")}>Turn off</button>
              </>
            ) : (
              <button type="button" className={btnPrimary} disabled={busy || perm === "denied"} onClick={() => run(async () => { await enablePush(); setOn(true); }, "Notifications are on.")}><BellRing className="h-4 w-4" />Turn on notifications</button>
            )}
          </div>
        )}
        {ready && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">{sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}Beep on live notifications: {sound ? "on" : "off"}</span>
            <button type="button" className={btnGhost} onClick={() => { const n = !sound; setSound(n); setSoundEnabled(n); if (n) beep(); }}>{sound ? "Turn off" : "Turn on"}</button>
          </div>
        )}
        {perm === "denied" && !on && <p className="text-xs text-rose-600">Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.</p>}
        {msg && <p className={"text-xs " + (msg.ok ? "text-emerald-700" : "text-rose-600")}>{msg.text}</p>}
      </div>
    </section>
  );
}
