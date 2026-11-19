"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type DropAnimationFunction,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, CheckSquare, MessageSquare, RotateCcw } from "lucide-react";
import type { Priority } from "@bitcode/shared";
import { STATUSES, STATUS_LABEL, type Status } from "@bitcode/shared";
import { api } from "@/lib/api";
import { NEXT_ACTION, STATUS_DOT, TYPE_LABEL } from "@/lib/ui";
import type { Ticket } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { AssigneeStack, DueChip, PriorityPill, TypeIcon, assigneeLabel } from "./Bits";

type Cols = Record<Status, Ticket[]>;
const group = (tickets: Ticket[]): Cols => {
  const c = Object.fromEntries(STATUSES.map((s) => [s, [] as Ticket[]])) as Cols;
  [...tickets].sort((a, b) => a.position - b.position).forEach((t) => c[t.status].push(t));
  return c;
};
const midpoint = (above?: number, below?: number) =>
  above !== undefined && below !== undefined ? (above + below) / 2 : above !== undefined ? above + 1000 : below !== undefined ? below - 1000 : 1000;

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

/** Fly the overlay into the card's real slot (or back to where it came from), then reveal the real card. */
const dropAnimation: DropAnimationFunction = ({ active, dragOverlay, transform }) => {
  const target = document.querySelector<HTMLElement>(`[data-card-id="${active.id}"]`);
  if (!target) return;
  const to = target.getBoundingClientRect();
  const from = dragOverlay.node.getBoundingClientRect();
  const start = `translate3d(${transform.x}px, ${transform.y}px, 0)`;
  const end = `translate3d(${transform.x + (to.left - from.left)}px, ${transform.y + (to.top - from.top)}px, 0)`;
  return dragOverlay.node.animate([{ transform: start }, { transform: end }], { duration: 260, easing: EASE, fill: "forwards" }).finished.then(() => { target.style.opacity = "1"; }); // reveal the real card the instant the overlay lands
};

const noop = () => {};

function Card({ t, onOpen, onAdvance, overlay, canAdvance = true }: { t: Ticket; onOpen: () => void; onAdvance: (to: Status) => void; overlay?: boolean; canAdvance?: boolean }) {
  const next = NEXT_ACTION[t.status];
  const { user } = useAuth();
  const { toneOf } = useWorkspace();
  const mine = !!user && t.assignees.some((a) => a.id === user.id); // assigned to the person looking at the board
  const tones = t.assignees.slice(0, 1).map((a) => toneOf(a.id)); // the card is tinted with its (first) assignee's own colour
  return (
    <div className={clsx("relative rounded-[20px] border p-4 transition-shadow duration-200", tones[0] ? `${tones[0].soft} ${tones[0].border}` : "border-transparent bg-white", overlay ? "scale-[1.02] cursor-grabbing shadow-lift" : "shadow-card hover:shadow-lift", mine && "ring-2 ring-indigo-500")}>
      {mine && <span className="absolute left-4 top-0 z-10 -translate-y-1/2 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-card" title="Assigned to you">Assigned to you</span>}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-500"><TypeIcon t={t.type} />{t.key}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-normal">{TYPE_LABEL[t.type]}</span></span>
        <PriorityPill p={t.priority} />
      </div>
      <button className="mb-3 w-full text-left text-[15px] font-semibold leading-snug hover:text-indigo-600" onClick={onOpen}>{t.title}</button>
      {t.dueDate && t.status !== "DONE" && <div className="mb-3"><DueChip due={t.dueDate} done={false} /></div>}
      {t.labels.length > 0 && <div className="mb-3 flex flex-wrap gap-1">{t.labels.map((l) => <span key={l} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{l}</span>)}</div>}
      <div className={clsx("flex items-center justify-between border-t border-slate-100 pt-3", t.assignees.length > 1 && "flex-wrap gap-y-2")}>
        <span className={clsx("flex items-center gap-2 text-sm", t.assignees.length > 1 ? "shrink-0" : "min-w-0")}><AssigneeStack users={t.assignees} /><span className="truncate" title={t.assignees.map((a) => a.name).join(", ")}>{assigneeLabel(t.assignees)}</span>
          {t._count.comments > 0 && <span className="flex items-center gap-0.5 text-xs text-slate-400"><MessageSquare className="h-3 w-3" />{t._count.comments}</span>}
          {t.subtasks.length > 0 && <span className="flex items-center gap-0.5 text-xs text-slate-400" title="Subtasks done"><CheckSquare className="h-3 w-3" />{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}</span>}</span>
        {next && !overlay && canAdvance && (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onAdvance(next.to)} className={clsx(t.assignees.length > 1 && "ml-auto", "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100")}>
            {next.label}<ArrowRight className="h-3 w-3" /></button>
        )}
      </div>
    </div>
  );
}

const MIN_COL = 84;      // narrowest a column can be squeezed: one dice-sized tile
const MINI_BELOW = 220;  // columns narrower than this show dice-sized tiles instead of cards
const CARD_MIN = 280;    // a card never gets narrower than this; wider columns fit several per row
const DOT: Record<Priority, string> = { LOW: "bg-slate-300", MEDIUM: "bg-sky-400", HIGH: "bg-amber-500", CRITICAL: "bg-rose-500" };
const WIDTHS_KEY = "board-col-widths-v1";

/** A card shrunk to a small square "dice": number, type and priority at a glance. Click to open. */
function Tile({ t, onOpen }: { t: Ticket; onOpen: () => void }) {
  const { toneOf } = useWorkspace();
  const tone = t.assignees[0] ? toneOf(t.assignees[0].id) : null;
  return (
    <button type="button" onClick={onOpen} title={`${t.key} · ${t.title}${t.assignees.length ? " · " + t.assignees.map((a) => a.name).join(", ") : ""}`}
      className={clsx("relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-2xl border text-slate-700 transition hover:-translate-y-0.5 hover:shadow-card", tone ? `${tone.soft} ${tone.border}` : "border-transparent bg-white")}>
      <span className={clsx("absolute right-1.5 top-1.5 h-2 w-2 rounded-full", DOT[t.priority])} />
      <TypeIcon t={t.type} />
      <span className="text-[13px] font-bold leading-none">{t.key.split("-").pop()}</span>
    </button>
  );
}

function DraggableCard({ t, hidden, landing, movable, mover, onOpen, onAdvance, onDenied, mini }: {
  mini?: boolean; t: Ticket; hidden: boolean; landing: boolean; movable: boolean; mover?: string; onOpen: () => void; onAdvance: (to: Status) => void; onDenied?: () => void;
}) {
  const press = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  // locked card: if the pointer is pressed and dragged a few pixels, tell the user why it will not move
  const lockedHandlers = movable ? {} : {
    onPointerDown: (e: React.PointerEvent) => { press.current = { x: e.clientX, y: e.clientY, fired: false }; },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (!p || p.fired || !(e.buttons & 1)) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) { p.fired = true; onDenied?.(); }
    },
    onPointerUp: () => { press.current = null; },
    onPointerCancel: () => { press.current = null; },
  };
  // only the assignee or creator may drag; everyone else can open and comment
  const { attributes, listeners, setNodeRef } = useDraggable({ id: t.id, disabled: !movable });
  return (
    <div ref={setNodeRef} data-card-id={t.id} {...(movable ? { ...attributes, ...listeners } : lockedHandlers)}
      className={clsx("relative", !mini && "pb-3", movable && "touch-none cursor-grab", hidden && "hidden", landing && "opacity-0")}>
      {mover && <span className="absolute right-4 top-2 z-10 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-card">{mover} is moving…</span>}
      <div className={clsx("transition-opacity duration-200", mover && "opacity-45")}>{mini ? <Tile t={t} onOpen={onOpen} /> : <Card t={t} onOpen={onOpen} onAdvance={onAdvance} canAdvance={movable} />}</div>
    </div>
  );
}

/** Collapsible gap: animates open/closed so neighbouring cards glide instead of jumping. Can hold a live "ghost" of a card someone else is dragging. */
function Slot({ open, height, ghost }: { open: boolean; height: number; ghost?: { t: Ticket; name: string } }) {
  const hadGhost = useRef(false);
  const instant = hadGhost.current && !ghost; // ghost handed over to the real card: close at once so nothing slides
  useEffect(() => { hadGhost.current = !!ghost; }, [ghost]);
  const show = open || !!ghost;
  return (
    <div className={clsx("grid ease-out", instant ? "transition-none" : "transition-[grid-template-rows] duration-200", show ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="min-h-0 overflow-hidden">
        {ghost ? (
          <div className="px-1 pb-3 pt-3">
            <div className="anim-ghost relative rounded-[20px]">
              <span className="absolute -top-2 right-4 z-10 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-card">{ghost.name} is moving…</span>
              <div className="opacity-90"><Card t={ghost.t} onOpen={noop} onAdvance={noop} overlay /></div>
            </div>
          </div>
        ) : (
          <div style={{ height }} className={clsx("mb-3 rounded-[20px] border-2 border-dashed transition-colors", open ? "border-indigo-300 bg-indigo-100/50" : "border-transparent")} />
        )}
      </div>
    </div>
  );
}

function Column({ status, count, width, onResizeStart, children }: { status: Status; count: number; width: number | null; onResizeStart?: (e: React.PointerEvent) => void; children: (px: number) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const box = useRef<HTMLElement>(null);
  const [px, setPx] = useState(300);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.clientWidth));
    ro.observe(el); setPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const mini = px < MINI_BELOW;
  return (
    <section ref={box} data-colbox={status} style={width ? ({ "--w": `${width}px` } as React.CSSProperties) : undefined}
      className={clsx("relative flex h-full min-h-0 w-[86%] shrink-0 snap-start flex-col rounded-[28px] p-3 transition-colors duration-200",
        width ? "sm:w-[var(--w)] sm:flex-none" : "sm:w-auto sm:min-w-[272px] sm:flex-1 sm:basis-0", isOver ? "bg-indigo-100/50" : "bg-slate-200/50")}>
      <header className={clsx("mb-3 flex shrink-0 items-center", mini ? "flex-col gap-1.5" : "justify-between")} title={mini ? STATUS_LABEL[status] : undefined}>
        <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-600">
          <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />{!mini && STATUS_LABEL[status].toUpperCase()}</h2>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 shadow-card">{count}</span>
      </header>
      <div ref={setNodeRef} data-col={status} data-perrow={mini ? 0 : Math.max(1, Math.floor((px - 24 + 12) / (CARD_MIN + 12)))} className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-3">{children(px)}</div>
      {onResizeStart && <div onPointerDown={onResizeStart} title="Drag to resize · double-click to reset" className="group/h absolute -right-4 top-0 z-10 hidden h-full w-4 cursor-col-resize touch-none items-center justify-center sm:flex"><span className="h-12 w-1 rounded-full bg-slate-300 opacity-0 transition group-hover/h:opacity-100" /></div>}
    </section>
  );
}

export function Board() {
  const { tickets, openTicket } = useWorkspace();
  const { user, requireAuth } = useAuth();
  const { remoteDrags, sendDrag } = useRealtime();
  const qc = useQueryClient();
  const canMove = (t: Ticket) => !!user && (t.reporter.id === user.id || t.assignees.some((a) => a.id === user.id));
  const { notify } = useRealtime();
  const lastDenied = useRef(0);
  // someone tried to drag a card that is not theirs: explain why nothing happens
  const denied = (t: Ticket) => {
    if (Date.now() - lastDenied.current < 2500) return;
    lastDenied.current = Date.now();
    notify(`You can’t move ${t.key}: it isn’t assigned to you. Only its assignees or the person who created it can change it, but you can still comment.`);
  };
  // each person's own column widths (px, remembered in this browser); a column without one shares the free space
  const [widths, setWidths] = useState<Partial<Record<Status, number>>>({});
  useEffect(() => { try { const w = JSON.parse(localStorage.getItem(WIDTHS_KEY) || "{}"); if (w && typeof w === "object") setWidths(w); } catch { /* none saved */ } }, []);
  const saveWidths = (w: Partial<Record<Status, number>>) => { try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(w)); } catch { /* private mode */ } };
  const startResize = (i: number) => (e: React.PointerEvent) => {
    const left = STATUSES[i], right = STATUSES[i + 1];
    const lw = document.querySelector<HTMLElement>(`[data-colbox="${left}"]`)?.getBoundingClientRect().width, rw = document.querySelector<HTMLElement>(`[data-colbox="${right}"]`)?.getBoundingClientRect().width;
    if (!lw || !rw) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; let latest: Partial<Record<Status, number>> | null = null;
    // the space one column gives up goes to its right-hand neighbour (and the other way round)
    const move = (ev: PointerEvent) => {
      const nl = Math.min(Math.max(lw + ev.clientX - x0, MIN_COL), lw + rw - MIN_COL);
      setWidths((w) => (latest = { ...w, [left]: Math.round(nl), [right]: Math.round(lw + rw - nl) }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (latest) saveWidths(latest); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const resetWidths = () => { setWidths({}); saveWidths({}); };
  const targetRef = useRef<{ col: Status; index: number } | null>(null);
  // Local optimistic move: applied in the same render as the drop, so the real card is already in its new slot
  // when the drop animation measures it (the query cache notifies React a tick later).
  const [optimistic, setOptimistic] = useState<{ id: string; status: Status; position: number } | null>(null);
  const cols = useMemo(
    () => group(optimistic ? tickets.map((t) => (t.id === optimistic.id ? { ...t, status: optimistic.status, position: optimistic.position } : t)) : tickets),
    [tickets, optimistic],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ col: Status; index: number } | null>(null);
  const [dragH, setDragH] = useState(120);
  const [landingId, setLandingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: user ? 6 : 100000 } }));
  const active = activeId ? tickets.find((t) => t.id === activeId) ?? null : null;

  type MoveVars = { id: string; status: Status; beforeId: string | null; afterId: string | null; position: number; projectId: string };
  const mutation = useMutation({
    mutationFn: (v: MoveVars) => api(`/tickets/${v.id}/move`, { method: "POST", json: { status: v.status, beforeId: v.beforeId, afterId: v.afterId } }),
  });
  const move = {
    mutate: (v: MoveVars) => {
      setOptimistic({ id: v.id, status: v.status, position: v.position });
      mutation.mutate(v, {
        // keep the optimistic card in place until fresh server data has arrived, then drop the override
        onError: (e: Error) => notify(e.message),
        onSettled: async () => { await qc.invalidateQueries({ queryKey: ["tickets"] }); setOptimistic((o) => (o?.id === v.id ? null : o)); },
      });
    },
  };
  const advance = (t: Ticket, to: Status) => requireAuth(() => {
    if (!canMove(t)) return;
    const last = cols[to][cols[to].length - 1];
    move.mutate({ id: t.id, status: to, beforeId: null, afterId: last?.id ?? null, position: midpoint(last?.position, undefined), projectId: t.project.id });
  });

  const onDragStart = (e: DragStartEvent) => {
    const t = tickets.find((x) => x.id === e.active.id);
    if (!t) return;
    setActiveId(t.id);
    setDragH(e.active.rect.current.initial?.height ?? 120);
    const start = { col: t.status, index: cols[t.status].findIndex((x) => x.id === t.id) };
    setTarget(start); targetRef.current = start; // gap starts exactly where the card was
    sendDrag(t.id, "start", start.col, start.index);  // let everyone else watch
  };

  // Which gap is the pointer in? Compare pointer Y with the midpoints of the column's visible cards.
  const onDragMove = (e: DragMoveEvent) => {
    const col = e.over?.id as Status | undefined;
    if (!col || !(STATUSES as readonly string[]).includes(col)) return;
    const ev = e.activatorEvent as PointerEvent;
    const py = ev.clientY + e.delta.y;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-col="${col}"] [data-card-id]`)).filter((n) => n.dataset.cardId !== String(e.active.id));
    const perRow = Number(document.querySelector<HTMLElement>(`[data-col="${col}"]`)?.dataset.perrow ?? 1);
    const px = ev.clientX + e.delta.x;
    // one card per row: compare heights. Several per row / dice: reading order (row first, then left to right).
    const after = (n: HTMLElement) => { const r = n.getBoundingClientRect(); return perRow === 1 ? r.top + r.height / 2 < py : py > r.bottom || (py >= r.top && px > r.left + r.width / 2); };
    let index = 0; nodes.forEach((n, i) => { if (after(n)) index = i + 1; });
    setTarget((p) => (p && p.col === col && p.index === index ? p : { col, index }));
    const last = targetRef.current;
    if (!last || last.col !== col || last.index !== index) { targetRef.current = { col, index }; sendDrag(String(e.active.id), "move", col, index); }
  };

  // while dragging, keep telling others we're still here (they discard a drag that goes silent)
  useEffect(() => {
    if (!activeId) return;
    const i = setInterval(() => { const tg = targetRef.current; sendDrag(activeId, "move", tg?.col, tg?.index); }, 4000);
    return () => clearInterval(i);
  }, [activeId, sendDrag]);

  const onDragEnd = (_e: DragEndEvent) => {
    const t = active, dest = target;
    setActiveId(null); setTarget(null); targetRef.current = null;
    if (!t) return;
    sendDrag(t.id, "end");
    setLandingId(t.id);
    const clear = () => setLandingId(null);
    setTimeout(clear, 320); // safety net if the drop animation can't run
    if (!dest) return;
    const list = cols[dest.col].filter((x) => x.id !== t.id);
    const above = list[dest.index - 1], below = list[dest.index];
    const unchanged = dest.col === t.status && cols[t.status].findIndex((x) => x.id === t.id) === dest.index;
    if (unchanged) return;
    move.mutate({ id: t.id, status: dest.col, beforeId: below?.id ?? null, afterId: above?.id ?? null, position: midpoint(above?.position, below?.position), projectId: t.project.id });
  };
  const onDragCancel = () => {
    if (activeId) { setLandingId(activeId); setTimeout(() => setLandingId(null), 320); sendDrag(activeId, "end"); }
    setActiveId(null); setTarget(null); targetRef.current = null;
  };

  // ghosts of cards other people are dragging right now, positioned in the column they hover over
  const ghostsFor = (s: Status, visible: Ticket[]) => Object.values(remoteDrags).flatMap((d) => {
    if (d.col !== s || d.index === undefined || d.ticketId === activeId) return [];
    const t = tickets.find((x) => x.id === d.ticketId);
    if (!t) return [];
    const before = visible.filter((x) => x.id !== d.ticketId)[d.index];
    return [{ pos: before ? visible.indexOf(before) : visible.length, t, name: d.actorName }];
  });

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div className="flex h-full flex-col">
      {Object.keys(widths).length > 0 && (
        <div className="mb-2 hidden shrink-0 justify-end sm:flex">
          <button type="button" onClick={resetWidths} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-card transition hover:text-indigo-600"><RotateCcw className="h-3.5 w-3.5" />Reset column sizes</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto pb-1 sm:snap-none" onDoubleClick={(e) => { if ((e.target as HTMLElement).closest("[title^='Drag to resize']")) resetWidths(); }}>
        {STATUSES.map((s, i) => {
          const visible = cols[s].filter((t) => t.id !== activeId);
          const openAt = target?.col === s ? target.index : -1;
          const ghosts = ghostsFor(s, visible);
          return (
            <Column key={s} status={s} count={cols[s].length} width={widths[s] ?? null} onResizeStart={i < STATUSES.length - 1 ? startResize(i) : undefined}>
              {(px) => {
                const mini = px < MINI_BELOW;
                const perRow = Math.max(1, Math.floor((px - 24 + 12) / (CARD_MIN + 12)));
                return (
                  <div className={mini ? "flex flex-wrap content-start gap-2" : "grid gap-x-3"} style={mini ? undefined : { gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
                    {visible.map((t, idx) => (
                      <div key={t.id} className={mini ? "contents" : undefined}>
                        {mini
                          ? (openAt === idx && <div className="h-14 w-14 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-100/50" />)
                          : <Slot open={openAt === idx} height={dragH} ghost={ghosts.find((g) => g.pos === idx)} />}
                        <DraggableCard mini={mini} t={t} hidden={false} landing={landingId === t.id} movable={canMove(t)} mover={remoteDrags[t.id]?.actorName} onDenied={() => denied(t)} onOpen={() => openTicket(t.id)} onAdvance={(to) => advance(t, to)} />
                      </div>
                    ))}
                    {/* the dragged card stays mounted (hidden) so dnd-kit keeps its node */}
                    {active && active.status === s && <DraggableCard mini={mini} t={active} hidden landing={false} movable onOpen={noop} onAdvance={noop} />}
                    {mini
                      ? (openAt === visible.length && <div className="h-14 w-14 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-100/50" />)
                      : <Slot open={openAt === visible.length} height={dragH} ghost={ghosts.find((g) => g.pos === visible.length)} />}
                    {visible.length === 0 && openAt === -1 && ghosts.length === 0 && !(active && active.status === s) && (
                      mini ? <div className="h-14 w-14 rounded-2xl border border-dashed border-slate-300" />
                        : <div className="col-span-full flex h-24 items-center justify-center rounded-[20px] border border-dashed border-slate-300 text-sm text-slate-400">No tickets</div>
                    )}
                  </div>
                );
              }}
            </Column>
          );
        })}
      </div>
      </div>
      <DragOverlay dropAnimation={dropAnimation}>{active && <Card t={active} onOpen={() => {}} onAdvance={() => {}} overlay />}</DragOverlay>
    </DndContext>
  );
}
