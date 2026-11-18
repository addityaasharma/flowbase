"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type DropAnimationFunction,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, MessageSquare } from "lucide-react";
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
  const mine = !!user && t.assignees.some((a) => a.id === user.id); // assigned to the person looking at the board
  return (
    <div className={clsx("rounded-[20px] bg-white p-4 transition-shadow duration-200", overlay ? "scale-[1.02] cursor-grabbing shadow-lift" : "shadow-card hover:shadow-lift", mine && "relative ring-2 ring-indigo-500")}>
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
          {t._count.comments > 0 && <span className="flex items-center gap-0.5 text-xs text-slate-400"><MessageSquare className="h-3 w-3" />{t._count.comments}</span>}</span>
        {next && !overlay && canAdvance && (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onAdvance(next.to)} className={clsx(t.assignees.length > 1 && "ml-auto", "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100")}>
            {next.label}<ArrowRight className="h-3 w-3" /></button>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ t, hidden, landing, movable, mover, onOpen, onAdvance, onDenied }: {
  t: Ticket; hidden: boolean; landing: boolean; movable: boolean; mover?: string; onOpen: () => void; onAdvance: (to: Status) => void; onDenied?: () => void;
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
      className={clsx("relative pb-3", movable && "touch-none cursor-grab", hidden && "hidden", landing && "opacity-0")}>
      {mover && <span className="absolute right-4 top-2 z-10 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-card">{mover} is moving…</span>}
      <div className={clsx("transition-opacity duration-200", mover && "opacity-45")}><Card t={t} onOpen={onOpen} onAdvance={onAdvance} canAdvance={movable} /></div>
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

function Column({ status, count, children }: { status: Status; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className={clsx("flex h-full min-h-0 flex-col rounded-[28px] p-3 transition-colors duration-200", isOver ? "bg-indigo-100/50" : "bg-slate-200/50")}>
      <header className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-600">
          <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />{STATUS_LABEL[status].toUpperCase()}</h2>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 shadow-card">{count}</span>
      </header>
      <div ref={setNodeRef} data-col={status} className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-3">{children}</div>
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
    const index = nodes.filter((n) => { const r = n.getBoundingClientRect(); return r.top + r.height / 2 < py; }).length;
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
      <div className="grid h-full auto-cols-[minmax(272px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-1">
        {STATUSES.map((s) => {
          const visible = cols[s].filter((t) => t.id !== activeId);
          const openAt = target?.col === s ? target.index : -1;
          const ghosts = ghostsFor(s, visible);
          return (
            <Column key={s} status={s} count={cols[s].length}>
              {visible.map((t, i) => (
                <div key={t.id}>
                  <Slot open={openAt === i} height={dragH} ghost={ghosts.find((g) => g.pos === i)} />
                  <DraggableCard t={t} hidden={false} landing={landingId === t.id} movable={canMove(t)} mover={remoteDrags[t.id]?.actorName} onDenied={() => denied(t)} onOpen={() => openTicket(t.id)} onAdvance={(to) => advance(t, to)} />
                </div>
              ))}
              {/* the dragged card stays mounted (hidden) so dnd-kit keeps its node */}
              {active && active.status === s && <DraggableCard t={active} hidden landing={false} movable onOpen={noop} onAdvance={noop} />}
              <Slot open={openAt === visible.length} height={dragH} ghost={ghosts.find((g) => g.pos === visible.length)} />
              {visible.length === 0 && openAt === -1 && ghosts.length === 0 && !(active && active.status === s) && (
                <div className="flex h-24 items-center justify-center rounded-[20px] border border-dashed border-slate-300 text-sm text-slate-400">No tickets</div>
              )}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={dropAnimation}>{active && <Card t={active} onOpen={() => {}} onAdvance={() => {}} overlay />}</DragOverlay>
    </DndContext>
  );
}
