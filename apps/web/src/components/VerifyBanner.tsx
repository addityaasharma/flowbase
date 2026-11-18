"use client";
import { useState } from "react";
import { MailWarning } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Shown to people who haven't confirmed their email yet (they can't create projects or invite until they do). */
export function VerifyBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  if (!user || user.emailVerified !== false) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span>Please confirm your email <b>{user.email}</b> to create projects and invite teammates.</span>
      <button disabled={state === "sending" || state === "sent"} className="font-semibold underline underline-offset-2 hover:text-amber-700 disabled:no-underline disabled:opacity-60"
        onClick={async () => { setState("sending"); try { await api("/auth/resend-verification", { method: "POST" }); setState("sent"); } catch { setState("error"); } }}>
        {state === "sent" ? "Email sent. Check your inbox" : state === "sending" ? "Sending…" : state === "error" ? "Couldn’t send. Try later" : "Resend email"}
      </button>
    </div>
  );
}
