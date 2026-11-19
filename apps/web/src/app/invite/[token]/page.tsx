"use client";
import { use, useEffect, useState } from "react";
import { FlowbaseMark } from "@/components/Logo";
import { api, tokenStore } from "@/lib/api";
import { btnPrimary, inputCls } from "@/components/Bits";

type Info = { email: string; project: string | null; invitedBy: string; existingUser: boolean; signedIn: { email: string; matches: boolean } | null };

export default function AcceptInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [invalid, setInvalid] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Info>(`/invitations/token/${token}`).then(setInfo).catch((e) => setInvalid(e.message)); }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="anim-pop w-full max-w-sm space-y-4 rounded-[28px] bg-white p-8 shadow-lift">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-slate-100 text-slate-800 ring-1 ring-black/5"><FlowbaseMark className="h-6 w-auto" /></span>
          <div><h1 className="text-lg font-semibold">Flowbase</h1><p className="text-sm text-slate-500">by Bitcode Software</p></div>
        </div>
        {invalid ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{invalid}. Ask whoever invited you to send a new link.</p>
        ) : !info ? <p className="text-slate-500">Loading…</p> : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError("");
            try {
              const r = await api<{ token: string }>("/invitations/accept", { method: "POST", json: { token, name: info?.existingUser ? undefined : name, password: info?.signedIn?.matches ? undefined : password } });
              tokenStore.set(r.token);
              location.href = "/";
            } catch (err) { setError((err as Error).message); setBusy(false); }
          }}>
            <p className="text-sm text-slate-600"><b>{info.invitedBy}</b> invited you{info.project ? <> to <b>{info.project}</b></> : ""}.
              {info.signedIn?.matches ? " You’re already signed in, so you can join right away." : info.existingUser && " You already have an account, so just enter your password."}</p>
            <input className={inputCls} value={info.email} disabled />
            {info.signedIn && !info.signedIn.matches && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">You’re currently signed in as <b className="break-all">{info.signedIn.email}</b>. Joining as <b className="break-all">{info.email}</b> will sign that account out on this browser.</p>
            )}
            {!info.existingUser && <input autoFocus className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />}
            {!info.signedIn?.matches && <input className={inputCls} type="password" placeholder={info.existingUser ? "Your password" : "Choose a password (min 8)"} minLength={info.existingUser ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)} required />}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className={btnPrimary + " w-full"} disabled={busy}>{busy ? "Joining…" : info.signedIn?.matches ? (info.project ? `Join ${info.project}` : "Join") : info.existingUser ? "Sign in & join" : "Join workspace"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
