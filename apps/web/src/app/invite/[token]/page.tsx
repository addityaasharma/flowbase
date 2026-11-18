"use client";
import { use, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, tokenStore } from "@/lib/api";
import { btnPrimary, inputCls } from "@/components/Bits";

type Info = { email: string; project: string | null; invitedBy: string; existingUser: boolean };

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
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-b from-indigo-400 to-indigo-600 text-white"><Sparkles className="h-5 w-5" /></span>
          <div><h1 className="text-lg font-semibold">Bitcode Tracker</h1><p className="text-sm text-slate-500">Bitcode Software</p></div>
        </div>
        {invalid ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{invalid}. Ask whoever invited you to send a new link.</p>
        ) : !info ? <p className="text-slate-500">Loading…</p> : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError("");
            try {
              const r = await api<{ token: string }>("/invitations/accept", { method: "POST", json: { token, name: info?.existingUser ? undefined : name, password } });
              tokenStore.set(r.token);
              location.href = "/";
            } catch (err) { setError((err as Error).message); setBusy(false); }
          }}>
            <p className="text-sm text-slate-600"><b>{info.invitedBy}</b> invited you{info.project ? <> to <b>{info.project}</b></> : ""}.{info.existingUser && " You already have an account, so just enter your password."}</p>
            <input className={inputCls} value={info.email} disabled />
            {!info.existingUser && <input autoFocus className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />}
            <input className={inputCls} type="password" placeholder={info.existingUser ? "Your password" : "Choose a password (min 8)"} minLength={info.existingUser ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className={btnPrimary + " w-full"} disabled={busy}>{busy ? "Joining…" : info.existingUser ? "Sign in & join" : "Join workspace"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
