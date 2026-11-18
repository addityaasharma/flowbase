"use client";
import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@bitcode/shared";
import { NO_FILTERS, filtersActive, useWorkspace } from "@/lib/workspace";

/** Search + filters for the board and the ticket list. Everything happens in the browser, so results update as you type. */
export function FilterBar() {
  const { filters: f, setFilters, allLabels, tickets, totalCount } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const focus = () => input.current?.focus(); window.addEventListener("flowbase:search", focus); return () => window.removeEventListener("flowbase:search", focus); }, []);
  const set = (p: Partial<typeof f>) => setFilters({ ...f, ...p });
  const toggle = (p: Priority) => set({ priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p] });
  const sel = "rounded-full bg-slate-200/70 px-3 py-1.5 text-xs font-medium outline-none hover:bg-slate-200";
  return (
    <div className="shrink-0 border-b border-black/5 bg-slate-50">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-6 py-2.5">
        <div className="relative w-64 max-w-full">
          <Search className="pointer-events-none absolute left-3 top-2 h-4 w-4 text-slate-400" />
          <input ref={input} value={f.q} onChange={(e) => set({ q: e.target.value })} onKeyDown={(e) => e.key === "Escape" && (set({ q: "" }), e.currentTarget.blur())}
            placeholder="Search tickets…  ( / )" className="w-full rounded-full bg-slate-200/70 py-1.5 pl-9 pr-8 text-sm outline-none placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/15" />
          {f.q && <button aria-label="Clear search" onClick={() => set({ q: "" })} className="absolute right-2 top-1.5 rounded-full p-0.5 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex items-center gap-1">
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => toggle(p)} aria-pressed={f.priorities.includes(p)}
              className={clsx("rounded-full px-2.5 py-1.5 text-xs font-medium transition", f.priorities.includes(p) ? "bg-slate-900 text-white" : "bg-slate-200/70 text-slate-600 hover:bg-slate-200")}>{PRIORITY_LABEL[p]}</button>
          ))}
        </div>
        {allLabels.length > 0 && (
          <select className={sel} value={f.label} onChange={(e) => set({ label: e.target.value })} aria-label="Label"><option value="">All labels</option>{allLabels.map((l) => <option key={l}>{l}</option>)}</select>
        )}
        <select className={sel} value={f.due} onChange={(e) => set({ due: e.target.value as typeof f.due })} aria-label="Due date">
          <option value="">Any due date</option><option value="overdue">Overdue</option><option value="week">Due this week</option><option value="none">No due date</option>
        </select>
        <button onClick={() => set({ mine: !f.mine })} aria-pressed={f.mine} className={clsx("rounded-full px-3 py-1.5 text-xs font-medium transition", f.mine ? "bg-indigo-600 text-white" : "bg-slate-200/70 text-slate-600 hover:bg-slate-200")}>Assigned to me</button>
        {filtersActive(f) && (
          <>
            <button onClick={() => setFilters(NO_FILTERS)} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"><X className="h-3 w-3" />Clear</button>
            <span className="text-xs text-slate-500">Showing {tickets.length} of {totalCount}</span>
          </>
        )}
      </div>
    </div>
  );
}
