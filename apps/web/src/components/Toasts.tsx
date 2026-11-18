"use client";
import { ArrowRight, Lock, MessageSquare, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useRealtime, type ToastKind } from "@/lib/realtime";
import { useWorkspace } from "@/lib/workspace";

const ICON: Record<ToastKind, { Icon: typeof Plus; cls: string }> = {
  moved: { Icon: ArrowRight, cls: "bg-indigo-100 text-indigo-600" },
  created: { Icon: Plus, cls: "bg-emerald-100 text-emerald-600" },
  comment: { Icon: MessageSquare, cls: "bg-amber-100 text-amber-600" },
  updated: { Icon: Pencil, cls: "bg-sky-100 text-sky-600" },
  deleted: { Icon: Trash2, cls: "bg-rose-100 text-rose-600" },
  member: { Icon: UserPlus, cls: "bg-violet-100 text-violet-600" },
  denied: { Icon: Lock, cls: "bg-amber-100 text-amber-600" },
};

/** Live activity popups: bottom-right, fade in, fade out after ~5s. Click to open the ticket. */
export function Toasts() {
  const { toasts, dismiss } = useRealtime();
  const { openTicket } = useWorkspace();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {toasts.map((t) => {
        const { Icon, cls } = ICON[t.kind];
        return (
          <button key={t.id} onClick={() => { dismiss(t.id); if (t.ticketId) openTicket(t.ticketId); }}
            className="glass anim-toast pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/60 p-3 pr-4 text-left shadow-lift">
            <span className={"mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full " + cls}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 text-sm leading-snug">{t.actor && <b className="font-semibold">{t.actor} </b>}<span className={t.kind === "denied" ? "text-slate-700" : "text-slate-600"}>{t.text}</span></span>
          </button>
        );
      })}
    </div>
  );
}
