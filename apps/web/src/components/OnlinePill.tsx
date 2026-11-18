"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useRealtime } from "@/lib/realtime";
import { Avatar } from "./Bits";

/** "● 3 online" — who in the open project has Flowbase open right now. */
export function OnlinePill() {
  const { user } = useAuth();
  const { members } = useWorkspace();
  const { connected, onlineIds, isOnline } = useRealtime();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!connected) return null;

  const online = members.filter((m) => isOnline(m.id)), offline = members.filter((m) => !isOnline(m.id));
  const row = (m: (typeof members)[number], on: boolean) => (
    <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      <span className="relative"><Avatar user={m} size={30} /><span className={clsx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white", on ? "bg-emerald-500" : "bg-slate-300")} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{m.name}{m.id === user?.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}</span></span>
      <span className={clsx("text-xs", on ? "font-medium text-emerald-600" : "text-slate-400")}>{on ? "Online" : "Offline"}</span>
    </li>
  );

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-slate-200/70 py-1.5 pl-2.5 pr-3 text-sm font-medium hover:bg-slate-200">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
        {onlineIds.length} online
      </button>
      {open && (
        <div className="bg-white anim-pop absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-3xl border border-white/60 p-3 shadow-lift">
          <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Online · {online.length}</div>
          <ul className="max-h-60 overflow-y-auto">{online.length ? online.map((m) => row(m, true)) : <li className="px-2 py-2 text-sm text-slate-400">Nobody</li>}</ul>
          {offline.length > 0 && <>
            <div className="mt-2 border-t border-black/5 px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Offline · {offline.length}</div>
            <ul className="max-h-48 overflow-y-auto">{offline.map((m) => row(m, false))}</ul>
          </>}
        </div>
      )}
    </div>
  );
}
