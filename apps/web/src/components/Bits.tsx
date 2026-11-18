"use client";
import clsx from "clsx";
import type { Priority, Status, TicketType } from "@bitcode/shared";
import { PRIORITY_LABEL, STATUS_LABEL } from "@bitcode/shared";
import { Bug, CheckSquare, Sparkles, Wrench } from "lucide-react";
import { PRIORITY_PILL, STATUS_DOT, STATUS_PILL, avatarColor } from "@/lib/ui";
import type { User } from "@/lib/types";

export function Avatar({ user, size = 28 }: { user: Pick<User, "id" | "name"> | null; size?: number }) {
  if (!user) return <span style={{ width: size, height: size }} className="inline-flex items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400">?</span>;
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.42 }} title={user.name}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white shadow-sm", avatarColor(user.id))}>
      {user.name[0]?.toUpperCase()}
    </span>
  );
}
export const PriorityPill = ({ p }: { p: Priority }) => (
  <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide", PRIORITY_PILL[p])}>{PRIORITY_LABEL[p]}</span>
);
export const StatusPill = ({ s }: { s: Status }) => (
  <span className={clsx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", STATUS_PILL[s])}>
    <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_DOT[s])} />{STATUS_LABEL[s]}
  </span>
);
export function TypeIcon({ t, className = "h-4 w-4" }: { t: TicketType; className?: string }) {
  const map = { BUG: [Bug, "text-rose-500"], FEATURE: [Sparkles, "text-indigo-500"], IMPROVEMENT: [Wrench, "text-emerald-500"], TASK: [CheckSquare, "text-sky-500"] } as const;
  const [Icon, color] = map[t];
  return <Icon className={clsx(className, color)} />;
}
export const inputCls = "w-full rounded-xl border border-transparent bg-slate-100 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 hover:bg-slate-200/70 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 disabled:opacity-60";
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-4 pt-16 backdrop-blur-sm anim-fade" onMouseDown={onClose}>
      <div className={clsx("anim-pop w-full rounded-[28px] bg-white p-7 shadow-lift", wide ? "max-w-2xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 hover:bg-slate-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
