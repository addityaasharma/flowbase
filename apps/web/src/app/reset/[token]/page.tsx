"use client";
import { use, useEffect, useState } from "react";
import { FlowbaseMark } from "@/components/Logo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { btnPrimary, inputCls } from "@/components/Bits";

export default function ResetPassword({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { setSession } = useAuth();
  const [valid, setValid] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/auth/reset/${token}`).then(() => setValid(true)).catch(() => setValid(false)); }, [token]);
  const mismatch = again.length > 0 && pw !== again;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="anim-pop w-full max-w-sm space-y-4 rounded-[28px] bg-white p-8 shadow-lift">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-slate-100 text-slate-800 ring-1 ring-black/5"><FlowbaseMark className="h-6 w-auto" /></span>
          <div><h1 className="text-lg font-semibold">Choose a new password</h1><p className="text-sm text-slate-500">Flowbase</p></div>
        </div>
        {valid === null ? <p className="text-slate-500">Checking your link…</p> : !valid ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">This reset link is invalid or has expired. Go back and use “Forgot password?” to get a new one.</p>
        ) : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); if (mismatch) return; setBusy(true); setError("");
            try { const r = await api<{ token: string; user: User }>("/auth/reset", { method: "POST", json: { token, password: pw } }); setSession(r.token, r.user); location.href = "/"; }
            catch (err) { setError((err as Error).message); setBusy(false); }
          }}>
            <input autoFocus className={inputCls} type="password" placeholder="New password (min 8 characters)" minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <input className={inputCls} type="password" placeholder="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            {mismatch && <p className="text-sm text-rose-600">Passwords don’t match</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className={btnPrimary + " w-full"} disabled={busy || mismatch}>{busy ? "Saving…" : "Set password and sign in"}</button>
            <p className="text-xs text-slate-400">You’ll be signed out on all your other devices.</p>
          </form>
        )}
      </div>
    </main>
  );
}
