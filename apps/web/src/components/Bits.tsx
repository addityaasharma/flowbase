"use client";
import { useEffect } from "react";
import clsx from "clsx";
import type { Priority, Status, TicketType } from "@bitcode/shared";
import { PRIORITY_LABEL, STATUS_LABEL } from "@bitcode/shared";
import { Bug, CheckSquare, Sparkles, Wrench } from "lucide-react";
import { PRIORITY_PILL, STATUS_DOT, STATUS_PILL } from "@/lib/ui";
import { useWorkspace } from "@/lib/workspace";
import type { User } from "@/lib/types";

export function Avatar({ user, size = 28 }: { user: Pick<User, "id" | "name"> | null; size?: number }) {
  const { toneOf } = useWorkspace();
  if (!user) return <span style={{ width: size, height: size }} className="inline-flex items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400">?</span>;
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.42 }} title={user.name}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white shadow-sm", toneOf(user.id).avatar)}>
      {user.name[0]?.toUpperCase()}
    </span>
  );
}
/** Overlapping avatars (max 3) plus a "+N" bubble. */
export function AssigneeStack({ users, size = 28 }: { users: Pick<User, "id" | "name">[]; size?: number }) {
  if (!users.length) return <Avatar user={null} size={size} />;
  const shown = users.slice(0, 3), extra = users.length - shown.length;
  return (
    <span className="flex shrink-0 items-center" title={users.map((u) => u.name).join(", ")}>
      {shown.map((u, i) => <span key={u.id} style={{ marginLeft: i ? -size * 0.3 : 0 }}><Avatar user={u} size={size} /></span>)}
      {extra > 0 && <span style={{ marginLeft: -size * 0.3, width: size, height: size, fontSize: size * 0.38 }} className="inline-flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 ring-2 ring-white">+{extra}</span>}
    </span>
  );
}
export const assigneeLabel = (users: { name: string }[]) => (users.length === 0 ? "Unassigned" : users.length === 1 ? users[0].name : `${users.length} people`);

/** Toggle chips for choosing several assignees from the project's members. */
export function AssigneePicker({ members, value, onChange, disabled }: { members: User[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const list = disabled ? members.filter((m) => value.includes(m.id)) : members;
  return (
    <div className="flex flex-wrap gap-2">
      {list.length === 0 && <span className="text-sm font-normal text-slate-400">Nobody is assigned</span>}
      {list.map((m) => {
        const on = value.includes(m.id);
        return (
          <button type="button" key={m.id} disabled={disabled} onClick={() => toggle(m.id)}
            className={clsx("flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm font-normal transition disabled:cursor-default",
              on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
            <Avatar user={m} size={20} />{m.name}
          </button>
        );
      })}
    </div>
  );
}

/** "Due Nov 20", amber when due within a day, red when overdue. Done tickets show nothing. */
export function DueChip({ due, done }: { due: string | null; done: boolean }) {
  if (!due || done) return null;
  const d = due.slice(0, 10), today = new Date().toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const nice = new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const [cls, text] = d < today ? ["bg-rose-50 text-rose-600", `Overdue · ${nice}`] : d === today ? ["bg-amber-50 text-amber-700", "Due today"] : d === tomorrow ? ["bg-amber-50 text-amber-700", "Due tomorrow"] : ["bg-slate-100 text-slate-600", `Due ${nice}`];
  return <span className={clsx("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium", cls)}>{text}</span>;
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
export const inputCls = "w-full rounded-xl border border-transparent bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:bg-slate-200/70 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 disabled:opacity-60";
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { // the page behind stays put while a popup is open
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    // the popup always fits the screen; only its own content scrolls (no scrollbar shown)
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/25 p-4 backdrop-blur-sm anim-fade" onMouseDown={onClose}>
      <div className={clsx("anim-pop flex max-h-full w-full flex-col rounded-[28px] bg-white shadow-lift", wide ? "max-w-2xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between px-7 pb-4 pt-7">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 hover:bg-slate-200">✕</button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-7">{children}</div>
      </div>
    </div>
  );
}
