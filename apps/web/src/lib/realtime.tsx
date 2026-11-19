"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STATUS_LABEL, type Status } from "@bitcode/shared";
import { API_BASE, api, tokenStore } from "./api";
import { useAuth } from "./auth";
import { useWorkspace } from "./workspace";
import type { Ticket } from "./types";

export type ToastKind = "moved" | "created" | "comment" | "updated" | "deleted" | "member" | "denied" | "assigned" | "due" | "mention";
export type Toast = { id: number; kind: ToastKind; actor: { id: string; name: string } | null; text: string; ticketId?: string };
export type RemoteDrag = { ticketId: string; actorId: string; actorName: string; col?: Status; index?: number; seen: number };

type Ctx = {
  connected: boolean;
  toasts: Toast[]; dismiss: (id: number) => void;
  /** Show a local notification (e.g. "you can't move this card"). */
  notify: (text: string, kind?: ToastKind) => void;
  remoteDrags: Record<string, RemoteDrag>;
  /** People with the app open right now, in the current project. */
  onlineIds: string[]; isOnline: (userId: string) => boolean;
  sendDrag: (ticketId: string, phase: "start" | "move" | "end", col?: Status, index?: number) => void;
};
const C = createContext<Ctx>(null!);
export const useRealtime = () => useContext(C);

const TOAST_MS = 5200;
const DRAG_STALE_MS = 12000; // drop a remote drag we haven't heard about (their tab closed mid-drag)
let toastSeq = 0;

/** Short soft beep for live notifications (Web Audio, no asset). Silent if the browser blocks audio before any interaction. */
let audioCtx: AudioContext | null = null;
const SOUND_KEY = "flowbase.sound";
/** Per-device preference; on by default. */
export function soundEnabled() { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } }
export function setSoundEnabled(on: boolean) { try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ } }
export function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx ||= new AC();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.2);
  } catch { /* audio unavailable */ }
}

type Ev = {
  type?: string; projectId: string; actor: { id: string; name: string };
  ticket?: { id: string; key: string; title: string; status?: Status; position?: number };
  from?: Status; changes?: string[]; body?: string;
  ticketId?: string; phase?: "start" | "move" | "end"; col?: Status; index?: number; userId?: string; role?: string; name?: string;
  online?: boolean; projects?: Record<string, string[]>;
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { projects, project } = useWorkspace();
  const [presence, setPresence] = useState<Record<string, string[]>>({});
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [remoteDrags, setRemoteDrags] = useState<Record<string, RemoteDrag>>({});
  const meRef = useRef<string | null>(null);
  meRef.current = user?.id ?? null;
  const projectKey = projects.map((p) => p.id).sort().join(",");

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((kind: ToastKind, actor: { id: string; name: string } | null, text: string, ticketId?: string) => {
    const id = ++toastSeq;
    if (kind !== "denied" && soundEnabled()) beep();
    setToasts((t) => [...t.slice(-3), { id, kind, actor, text, ticketId }]); // at most 4 on screen
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  useEffect(() => {
    if (!user || !projectKey) { setConnected(false); return; }
    let stop = false;
    const ctrl = new AbortController();

    const handle = (type: string, e: Ev) => {
      const mine = e.actor?.id === meRef.current;
      const t = e.ticket;
      const q = (extra: string[] = ["tickets", e.projectId]) => qc.invalidateQueries({ queryKey: extra });
      switch (type) {
        case "ready": setConnected(true); qc.invalidateQueries({ queryKey: ["tickets"] }); break; // resync after (re)connect
        case "presence.snapshot": setPresence(e.projects ?? {}); break;
        case "presence":
          setPresence((p) => { const cur = new Set(p[e.projectId] ?? []); if (e.online) cur.add(e.userId!); else cur.delete(e.userId!); return { ...p, [e.projectId]: [...cur] }; });
          break;
        case "notification": qc.invalidateQueries({ queryKey: ["notifications"] }); break; // the bell refetches; popups are shown by the event itself
        case "drag": {
          if (mine || !e.ticketId) break;
          setRemoteDrags((d) => {
            const next = { ...d };
            if (e.phase === "end") delete next[e.ticketId!];
            else next[e.ticketId!] = { ticketId: e.ticketId!, actorId: e.actor.id, actorName: e.actor.name, col: e.col ?? d[e.ticketId!]?.col, index: e.index ?? d[e.ticketId!]?.index, seen: Date.now() };
            return next;
          });
          break;
        }
        case "ticket.moved":
          if (!t) break;
          // apply the move straight to the cache and clear the ghost in the same render: no flicker
          qc.setQueryData<Ticket[]>(["tickets", e.projectId], (old) => old?.map((x) => (x.id === t.id ? { ...x, status: t.status!, position: t.position! } : x)));
          setRemoteDrags((d) => { if (!d[t.id]) return d; const n = { ...d }; delete n[t.id]; return n; });
          qc.invalidateQueries({ queryKey: ["ticket", t.id] });
          if (!mine && e.from !== t.status) toast("moved", e.actor, `moved ${t.key} “${t.title}” to ${STATUS_LABEL[t.status!]}`, t.id);
          break;
        case "ticket.created":
          q(); if (!mine && t) toast("created", e.actor, `created ${t.key} “${t.title}”`, t.id); break;
        case "ticket.updated":
          q(); if (t) qc.invalidateQueries({ queryKey: ["ticket", t.id] });
          if (!mine && t) toast("updated", e.actor, `${(e.changes ?? []).join(", ")} on ${t.key}`, t.id); break;
        case "ticket.deleted":
          q(); if (!mine && t) toast("deleted", e.actor, `deleted ${t.key} “${t.title}”`); break;
        case "comment.created":
          q(); if (t) qc.invalidateQueries({ queryKey: ["ticket", t.id] });
          if (!mine && t) toast("comment", e.actor, `commented on ${t.key}: “${e.body}”`, t.id); break;
        case "project.updated": qc.invalidateQueries({ queryKey: ["projects"] }); break;
        case "member.joined": qc.invalidateQueries({ queryKey: ["projects"] }); if (!mine) toast("member", e.actor, "joined the project"); break;
        case "member.role": qc.invalidateQueries({ queryKey: ["projects"] }); if (!mine) toast("member", e.actor, `changed a member’s role to ${e.role}`); break;
        case "member.removed": qc.invalidateQueries({ queryKey: ["projects"] }); if (!mine) toast("member", e.actor, e.userId === meRef.current ? "removed you from the project" : "removed a member"); break;
        case "project.deleted": qc.invalidateQueries({ queryKey: ["projects"] }); if (!mine) toast("deleted", e.actor, e.name ? `deleted the project “${e.name}”` : "deleted the project"); break;
      }
    };

    (async () => {
      let delay = 1000;
      while (!stop) {
        try {
          const res = await fetch(`${API_BASE}/events`, { headers: { Authorization: `Bearer ${tokenStore.get()}` }, signal: ctrl.signal });
          if (res.status === 401) return;
          if (!res.ok || !res.body) throw new Error("stream refused");
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i: number;
            while ((i = buf.indexOf("\n\n")) >= 0) {
              const block = buf.slice(0, i); buf = buf.slice(i + 2);
              const type = /^event: (.+)$/m.exec(block)?.[1];
              const data = /^data: (.+)$/m.exec(block)?.[1];
              if (type && data) { delay = 1000; try { handle(type, JSON.parse(data)); } catch { /* ignore a malformed event */ } }
            }
          }
        } catch { /* network drop or abort: fall through to reconnect */ }
        if (stop) return;
        setConnected(false); setPresence({});
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 10000);
      }
    })();
    return () => { stop = true; ctrl.abort(); setConnected(false); };
  }, [user, projectKey, qc, toast]);

  // forget remote drags that went silent
  useEffect(() => {
    const t = setInterval(() => setRemoteDrags((d) => {
      const stale = Object.keys(d).filter((k) => Date.now() - d[k].seen > DRAG_STALE_MS);
      if (!stale.length) return d;
      const n = { ...d }; stale.forEach((k) => delete n[k]); return n;
    }), 2000);
    return () => clearInterval(t);
  }, []);

  const sendDrag: Ctx["sendDrag"] = useCallback((ticketId, phase, col, index) => {
    api(`/tickets/${ticketId}/drag`, { method: "POST", json: { phase, col, index } }).catch(() => { /* presence is best-effort */ });
  }, []);

  const notify = useCallback((text: string, kind: ToastKind = "denied") => toast(kind, null, text), [toast]);

  const onlineIds = project ? presence[project.id] ?? [] : [];
  const isOnline = (id: string) => onlineIds.includes(id);

  return <C.Provider value={{ connected, toasts, dismiss, notify, remoteDrags, sendDrag, onlineIds, isOnline }}>{children}</C.Provider>;
}
