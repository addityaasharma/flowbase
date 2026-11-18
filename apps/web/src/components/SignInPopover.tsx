"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { btnPrimary, inputCls } from "./Bits";

/** Floating card anchored top-right; no backdrop so the page stays usable. Sign in or create an account. */
export function SignInPopover() {
  const { login, register, signInOpen, setSignInOpen } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // every time the popover closes, go back to a clean "Sign in" form (never reopen on a stale "Sign up" tab)
  useEffect(() => {
    if (!signInOpen) { setMode("in"); setName(""); setEmail(""); setPassword(""); setError(""); }
  }, [signInOpen]);

  useEffect(() => {
    if (!signInOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSignInOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signInOpen, setSignInOpen]);

  if (!signInOpen) return null;
  const up = mode === "up";
  return (
    <form
      className="glass anim-pop fixed right-4 top-4 z-[60] w-80 space-y-3 rounded-3xl border border-white/60 p-5 shadow-lift"
      onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        try { await (up ? register(name, email, password) : login(email, password)); setPassword(""); }
        catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
      <div className="flex items-center justify-between">
        <div><h2 className="font-semibold">{up ? "Create your account" : "Welcome back"}</h2><p className="text-xs text-slate-500">Bitcode Tracker</p></div>
        <button type="button" onClick={() => setSignInOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-0.5 rounded-full bg-slate-200/70 p-1 text-sm font-medium">
        {(["in", "up"] as const).map((m) => (
          <button type="button" key={m} onClick={() => { setMode(m); setError(""); }}
            className={clsx("flex-1 rounded-full py-1.5", mode === m ? "bg-white shadow-card" : "text-slate-600")}>{m === "in" ? "Sign in" : "Sign up"}</button>
        ))}
      </div>
      {up && <input autoFocus className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />}
      <input autoFocus={!up} className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className={inputCls} type="password" placeholder={up ? "Password (min 8 characters)" : "Password"} minLength={up ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className={btnPrimary + " w-full"} disabled={busy}>{busy ? "Please wait…" : up ? "Create account" : "Sign in"}</button>
    </form>
  );
}
