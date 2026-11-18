"use client";
import { use, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { FlowbaseMark } from "@/components/Logo";
import { api } from "@/lib/api";
import { btnPrimary } from "@/components/Bits";

export default function VerifyEmail({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<"working" | "ok" | { error: string }>("working");
  useEffect(() => { api("/auth/verify", { method: "POST", json: { token } }).then(() => setState("ok")).catch((e) => setState({ error: e.message })); }, [token]);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="anim-pop w-full max-w-sm space-y-4 rounded-[28px] bg-white p-8 text-center shadow-lift">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-slate-100 text-slate-800 ring-1 ring-black/5"><FlowbaseMark className="h-6 w-auto" /></span>
        {state === "working" && <p className="text-slate-500">Confirming your email…</p>}
        {state === "ok" && (<><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h1 className="text-lg font-semibold">Email confirmed</h1><p className="text-sm text-slate-500">You can now create projects and invite teammates.</p><a href="/" className={btnPrimary + " w-full"}>Open Flowbase</a></>)}
        {typeof state === "object" && (<><XCircle className="mx-auto h-10 w-10 text-rose-500" /><h1 className="text-lg font-semibold">Link problem</h1><p className="text-sm text-slate-500">{state.error}. Sign in and choose “Resend” in the banner at the top to get a fresh link.</p><a href="/" className={btnPrimary + " w-full"}>Go to Flowbase</a></>)}
      </div>
    </main>
  );
}
