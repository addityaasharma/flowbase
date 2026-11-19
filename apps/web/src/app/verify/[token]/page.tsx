"use client";
import { use, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { FlowbaseMark } from "@/components/Logo";
import { api, tokenStore } from "@/lib/api";
import { btnPrimary } from "@/components/Bits";
import type { User } from "@/lib/types";

type State = "working" | { signedIn: User } | "already" | { error: string };

export default function VerifyEmail({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<State>("working");
  const started = useRef(false); // the link is single-use: never send it twice (React dev mode runs effects twice)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ token?: string; user?: User; alreadyVerified?: boolean }>("/auth/verify", { method: "POST", json: { token } })
      .then((r) => {
        if (r.token && r.user) {
          // the emailed link belongs to this account: sign it in here, replacing whoever was signed in on this browser,
          // then reload so nothing of the previous person (cached data, live connection) is left over
          tokenStore.set(r.token);
          setState({ signedIn: r.user });
          setTimeout(() => window.location.replace("/"), 1400);
        } else setState("already"); // opened before (second email, another tab): the address is confirmed, nobody is signed in by this
      })
      .catch((e) => setState({ error: e.message }));
  }, [token]);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="anim-pop w-full max-w-sm space-y-4 rounded-[28px] bg-white p-8 text-center shadow-lift">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-slate-100 text-slate-800 ring-1 ring-black/5"><FlowbaseMark className="h-6 w-auto" /></span>
        {state === "working" && <p className="text-slate-500">Confirming your email…</p>}
        {typeof state === "object" && "signedIn" in state && (<><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h1 className="text-lg font-semibold">Email confirmed</h1><p className="text-sm text-slate-500">Signing you in as <b className="break-all">{state.signedIn.email}</b>…</p><a href="/" className={btnPrimary + " w-full"}>Open Flowbase</a></>)}
        {state === "already" && (<><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h1 className="text-lg font-semibold">Already confirmed</h1><p className="text-sm text-slate-500">This email address is confirmed. Sign in to continue.</p><a href="/" className={btnPrimary + " w-full"}>Go to Flowbase</a></>)}
        {typeof state === "object" && "error" in state && (<><XCircle className="mx-auto h-10 w-10 text-rose-500" /><h1 className="text-lg font-semibold">Link problem</h1><p className="text-sm text-slate-500">{state.error}. Sign in and choose “Resend” in the banner at the top to get a fresh link.</p><a href="/" className={btnPrimary + " w-full"}>Go to Flowbase</a></>)}
      </div>
    </main>
  );
}
