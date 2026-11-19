"use client";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { AssigneeStack, assigneeLabel, PriorityPill, StatusPill, TypeIcon } from "@/components/Bits";

export default function AllTickets() {
  const { tickets, openTicket, listStatus: status } = useWorkspace();
  const { user } = useAuth();
  const rows = tickets.filter((t) => !status || t.status === status);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* only this card scrolls (both ways); the header row stays put */}
      {/* phones: one compact card per ticket, full width, no sideways scrolling; only this list scrolls */}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-20 sm:hidden">
        {rows.map((t) => (
          <li key={t.id} onClick={() => openTicket(t.id)} className={"cursor-pointer rounded-2xl bg-white p-3.5 shadow-card active:bg-slate-50" + (t.assignees.some((a) => a.id === user?.id) ? " shadow-[inset_3px_0_0_#0071e3]" : "")}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500"><TypeIcon t={t.type} />{t.key}</span>
              <span className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug">{t.title}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <StatusPill s={t.status} /><PriorityPill p={t.priority} />
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600"><AssigneeStack users={t.assignees} size={20} /><span className="truncate">{t.assignees.length ? assigneeLabel(t.assignees) : "Unassigned"}</span></span>
              {t.dueDate && <span className="ml-auto text-xs text-slate-500">Due {new Date(t.dueDate).toLocaleDateString()}</span>}
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-10 text-center text-sm text-slate-400">No tickets match</li>}
      </ul>
      <div className="min-h-0 overflow-auto overscroll-contain rounded-[24px] bg-white shadow-card max-sm:hidden">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-[11px] uppercase tracking-wider text-slate-500 shadow-[0_1px_0_#f1f5f9]">
            <tr>{["Key", "Title", "Status", "Priority", "Assignees", "Due", "Updated"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr>
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
