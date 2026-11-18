"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@bitcode/shared";
import { Lock, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import type { TicketDetail } from "@/lib/types";
import { AssigneePicker, Avatar, TypeIcon, btnPrimary, inputCls } from "./Bits";

export function TicketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const { members, openTicket } = useWorkspace();
  const { requireAuth } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const q = useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`), refetchInterval: 30000 }); // live updates arrive over the event stream; this is only a safety net
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ticket", id] }); qc.invalidateQueries({ queryKey: ["tickets"] }); };
  const patch = useMutation({ mutationFn: (json: object) => api(`/tickets/${id}`, { method: "PATCH", json }), onSuccess: refresh });
  const addComment = useMutation({
    mutationFn: () => api(`/tickets/${id}/comments`, { method: "POST", json: { body: comment } }),
    onSuccess: () => { setComment(""); refresh(); },
  });
  const del = useMutation({ mutationFn: () => api(`/tickets/${id}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); openTicket(null); } });
  const t = q.data;
  const canDelete = !!user && !!q.data && q.data.reporter.id === user.id; // only the creator can delete
  const canEdit = !!user && !!t && (t.reporter.id === user.id || t.assignees.some((a) => a.id === user.id)); // an assignee or the creator; others can comment

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm anim-fade" onMouseDown={onClose}>
      <aside className="anim-slide h-full w-full max-w-xl overflow-y-auto rounded-l-[32px] bg-white p-8 shadow-lift" onMouseDown={(e) => e.stopPropagation()}>
        {!t ? <p className="text-slate-500">Loading…</p> : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><TypeIcon t={t.type} />{t.key}</div>
              <div className="flex gap-1">
                {canDelete && <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => confirm("Delete this ticket?") && del.mutate()}><Trash2 className="h-4 w-4" /></button>}
                <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">✕</button>
              </div>
            </div>
            {user && !canEdit && <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><Lock className="mt-0.5 h-4 w-4 shrink-0" />You can’t edit this ticket because it isn’t assigned to you. Only its assignees or the person who created it can change it. You can still comment below.</p>}
            <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <input key={t.updatedAt + "title"} className="w-full rounded-lg border border-transparent px-2 py-1 text-2xl font-semibold tracking-tight hover:border-slate-200 focus:border-indigo-500 focus:outline-none"
              defaultValue={t.title} onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && patch.mutate({ title: e.target.value.trim() })} />
            <textarea key={t.updatedAt + "desc"} className={inputCls} rows={5} placeholder="Add a description…" defaultValue={t.description ?? ""}
              onBlur={(e) => e.target.value !== (t.description ?? "") && patch.mutate({ description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3 text-xs font-medium text-slate-500">
              <label>Status<select className={inputCls} value={t.status} onChange={(e) => patch.mutate({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
              <label>Priority<select className={inputCls} value={t.priority} onChange={(e) => patch.mutate({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
              <div className="col-span-2"><div className="mb-1">Assigned to · {t.assignees.length} {t.assignees.length === 1 ? "person" : "people"}</div>
                <AssigneePicker members={members} value={t.assignees.map((a) => a.id)} disabled={!canEdit} onChange={(ids) => patch.mutate({ assigneeIds: ids })} /></div>
              <label>Due date<input type="date" className={inputCls} value={t.dueDate?.slice(0, 10) ?? ""} onChange={(e) => patch.mutate({ dueDate: e.target.value || null })} /></label>
            </div>
            </fieldset>
            <p className="text-xs text-slate-500">Reported by {t.reporter.name} · {new Date(t.createdAt).toLocaleString()}</p>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Comments ({t.comments.length})</h3>
              <div className="space-y-3">
                {t.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5"><Avatar user={c.author} />
                    <div className="flex-1 rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm">
                      <div className="text-xs text-slate-500"><b className="text-slate-700">{c.author.name}</b> · {new Date(c.createdAt).toLocaleString()}</div>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form className={"mt-3 flex gap-2" + (user ? "" : " hidden")} onSubmit={(e) => { e.preventDefault(); comment.trim() && addComment.mutate(); }}>
                <input className={inputCls} placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                <button className={btnPrimary} disabled={addComment.isPending}>Send</button>
              </form>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Activity</h3>
              <ul className="space-y-1.5 text-xs text-slate-500">
                {t.activities.map((a) => <li key={a.id}><b className="text-slate-700">{a.actor.name}</b> {a.message} · {new Date(a.createdAt).toLocaleString()}</li>)}
              </ul>
            </section>
          </div>
        )}
        {t && !user && (
          <button onClick={() => requireAuth()} className="mt-4 w-full rounded-full bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100">Sign in to edit or comment</button>
        )}
      </aside>
    </div>
  );
}
