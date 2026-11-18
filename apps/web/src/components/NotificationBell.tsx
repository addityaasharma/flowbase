"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, Check, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useRealtime, type ToastKind } from "@/lib/realtime";
import { timeAgo } from "@/lib/tones";
import type { AppNotification } from "@/lib/types";
import { ICON } from "./Toasts";

type Inbox = { items: AppNotification[]; unread: number };

/** Saved notifications: still there for people who were offline. Unread count updates live. */
export function NotificationBell() {
  const { user } = useAuth();
  const { goToTicket, toneOf } = useWorkspace();
  const { notify } = useRealtime();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const box = useRef<HTMLDivElement>(null);
  const key = ["notifications", user?.id];
  const q = useQuery({ queryKey: key, enabled: !!user, queryFn: () => api<Inbox>("/notifications?limit=50"), refetchInterval: 60_000 });
  const unread = q.data?.unread ?? 0;

  const patchCache = (fn: (i: Inbox) => Inbox) => qc.setQueryData<Inbox>(key, (old) => (old ? fn(old) : old));
  const markOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onMutate: (id) => patchCache((i) => i.items.some((n) => n.id === id && !n.readAt)
      ? { unread: Math.max(0, i.unread - 1), items: i.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) } : i),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onMutate: () => patchCache((i) => ({ unread: 0, items: i.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // the tab title shows the unread count, e.g. "(3) Flowbase"
  useEffect(() => { document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) Flowbase` : "Flowbase"; }, [unread]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!user) return null;
  const items = (q.data?.items ?? []).filter((n) => tab === "all" || !n.readAt);

  const openItem = async (n: AppNotification) => {
    if (!n.readAt) markOne.mutate(n.id);
    if (n.ticketId) {
      setOpen(false);
      if (!(await goToTicket(n.ticketId))) notify("That ticket no longer exists.");
    }
  };

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}
        className={clsx("relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-slate-200/70", open && "bg-slate-200/70")}>
        <Bell className="h-[18px] w-[18px] text-slate-700" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="bg-white anim-pop absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[min(72vh,580px)] w-[400px] max-w-[92vw] flex-col overflow-hidden rounded-3xl border border-white/60 shadow-lift">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
            <h2 className="font-semibold">Notifications {unread > 0 && <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600">{unread} new</span>}</h2>
            <button disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent">
              <CheckCheck className="h-3.5 w-3.5" />Mark all read</button>
          </div>
          <div className="flex shrink-0 gap-1 px-3 pt-2 text-xs font-medium">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={clsx("rounded-full px-3 py-1 capitalize", tab === t ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-200/70")}>{t}</button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-black/5 overflow-y-auto overscroll-contain p-2">
            {q.isLoading && <li className="p-6 text-center text-sm text-slate-400">Loading…</li>}
            {!q.isLoading && items.length === 0 && (
              <li className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-400">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100"><Bell className="h-5 w-5" /></span>
                {tab === "unread" ? "You’re all caught up" : "Nothing yet. You’ll see updates about your tasks here."}
              </li>
            )}
            {items.map((n) => {
              const { Icon, cls } = ICON[(n.kind in ICON ? n.kind : "updated") as ToastKind];
              const tone = n.actorId ? toneOf(n.actorId) : null;
              return (
                <li key={n.id}>
                  <div role="button" tabIndex={0} onClick={() => openItem(n)} onKeyDown={(e) => e.key === "Enter" && openItem(n)}
                    className={clsx("group flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/80", !n.readAt && "bg-indigo-50/60")}>
                    <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cls)}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 text-sm leading-snug">
                      {n.actorName && <b className={clsx("font-semibold", tone?.text)}>{n.actorName} </b>}
                      <span className={n.readAt ? "text-slate-500" : "text-slate-800"}>{n.text}</span>
                      <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.readAt && (
                      <span className="flex shrink-0 flex-col items-center gap-1.5 pt-1">
                        <span className="h-2 w-2 rounded-full bg-indigo-600" aria-label="Unread" />
                        <button title="Mark as read" aria-label="Mark as read" onClick={(e) => { e.stopPropagation(); markOne.mutate(n.id); }}
                          className="hidden h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-indigo-600 group-hover:flex"><Check className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
