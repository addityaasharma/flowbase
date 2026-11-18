"use client";
import { useState } from "react";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@bitcode/shared";
import { Search } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { AssigneeStack, assigneeLabel, PriorityPill, StatusPill, TypeIcon, inputCls } from "@/components/Bits";

export default function AllTickets() {
  const { tickets, openTicket } = useWorkspace();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const rows = tickets.filter((t) =>
    (!q || (t.title + t.key).toLowerCase().includes(q.toLowerCase())) && (!status || t.status === status) && (!priority || t.priority === priority));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-60"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className={inputCls + " pl-9"} placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={inputCls + " !w-44"} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <select className={inputCls + " !w-44"} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
      </div>
      <div className="overflow-x-auto rounded-[24px] bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>{["Key", "Title", "Status", "Priority", "Assignees", "Due", "Updated"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={"cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" + (t.assignees.some((a) => a.id === user?.id) ? " bg-indigo-50/40 shadow-[inset_3px_0_0_#0071e3]" : "")} onClick={() => openTicket(t.id)}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-500"><span className="flex items-center gap-1.5"><TypeIcon t={t.type} />{t.key}</span></td>
                <td className="px-4 py-3 font-semibold">{t.title}</td>
                <td className="px-4 py-3"><StatusPill s={t.status} /></td>
                <td className="px-4 py-3"><PriorityPill p={t.priority} /></td>
                <td className="px-4 py-3"><span className="flex items-center gap-2"><AssigneeStack users={t.assignees} size={24} /><span title={t.assignees.map((a) => a.name).join(", ")}>{t.assignees.length ? assigneeLabel(t.assignees) : "—"}</span></span></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(t.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No tickets match</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
