"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { btnPrimary, inputCls } from "./Bits";

type Mode = "in" | "up" | "forgot";

/** Floating card anchored top-right; no backdrop so the page stays usable. Sign in, create an account, or reset a password. */
export function SignInPopover() {
  const { login, register, signInOpen, setSignInOpen } = useAuth();
  const [mode, setMode] = useState<Mode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // every time the popover closes, go back to a clean "Sign in" form (never reopen on a stale tab)
  useEffect(() => {
    if (!signInOpen) { setMode("in"); setName(""); setEmail(""); setPassword(""); setError(""); setNotice(""); }
  }, [signInOpen]);
  useEffect(() => {
    if (!signInOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSignInOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signInOpen, setSignInOpen]);

  if (!signInOpen) return null;
  const up = mode === "up", forgot = mode === "forgot";
  const go = (m: Mode) => { setMode(m); setError(""); setNotice(""); };

  return (
    <form
      className="anim-pop fixed right-4 top-4 z-[60] w-80 space-y-3 rounded-3xl border border-white/60 bg-white p-5 shadow-lift"
      onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(""); setNotice("");
        try {
          if (forgot) { await api("/auth/forgot", { method: "POST", json: { email } }); setNotice("If an account exists for that email, we’ve sent a link to reset the password. It works for one hour."); }
          else { await (up ? register(name, email, password) : login(email, password)); setPassword(""); }
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
      <div className="flex items-center justify-between">
        <div><h2 className="font-semibold">{forgot ? "Reset your password" : up ? "Create your account" : "Welcome back"}</h2><p className="text-xs text-slate-500">Flowbase</p></div>
        <button type="button" onClick={() => setSignInOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      {!forgot && (
        <div className="flex gap-0.5 rounded-full bg-slate-200/70 p-1 text-sm font-medium">
          {(["in", "up"] as const).map((m) => (
            <button type="button" key={m} onClick={() => go(m)} className={clsx("flex-1 rounded-full py-1.5", mode === m ? "bg-white shadow-card" : "text-slate-600")}>{m === "in" ? "Sign in" : "Sign up"}</button>
          ))}
        </div>
      )}
      {forgot && <p className="text-sm text-slate-500">Enter your email and we’ll send you a link to choose a new password.</p>}
      {up && <input autoFocus className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />}
      <input autoFocus={!up} className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {!forgot && <input className={inputCls} type="password" placeholder={up ? "Password (min 8 characters)" : "Password"} minLength={up ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />}
      {!forgot && !up && <button type="button" onClick={() => go("forgot")} className="-mt-1 text-xs font-medium text-indigo-600 hover:underline">Forgot password?</button>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      <button className={btnPrimary + " w-full"} disabled={busy}>{busy ? "Please wait…" : forgot ? "Send reset link" : up ? "Create account" : "Sign in"}</button>
      {forgot && <button type="button" onClick={() => go("in")} className="flex w-full items-center justify-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3 w-3" />Back to sign in</button>}
    </form>
  );
}
