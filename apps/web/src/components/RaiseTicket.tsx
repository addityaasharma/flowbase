"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, TYPES } from "@bitcode/shared";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { TYPE_LABEL } from "@/lib/ui";
import { Modal, btnGhost, btnPrimary, inputCls } from "./Bits";

export function RaiseTicket({ onClose }: { onClose: () => void }) {
  const { project, members } = useWorkspace();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", description: "", type: "TASK", priority: "MEDIUM", status: "TODO", assigneeId: "", dueDate: "", labels: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const m = useMutation({
    mutationFn: () => api("/tickets", { method: "POST", json: {
      projectId: project!.id, title: f.title, description: f.description || undefined, type: f.type, priority: f.priority,
      status: f.status, assigneeId: f.assigneeId || null, dueDate: f.dueDate || null,
      labels: f.labels.split(",").map((s) => s.trim()).filter(Boolean),
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); onClose(); },
  });
  const sel = (k: keyof typeof f, opts: readonly string[], label: (v: string) => string) => (
    <select className={inputCls} value={f[k]} onChange={(e) => set(k, e.target.value)}>{opts.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>
  );
  return (
    <Modal title="Raise Ticket" onClose={onClose} wide>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <input autoFocus className={inputCls} placeholder="Title" value={f.title} onChange={(e) => set("title", e.target.value)} required />
        <textarea className={inputCls} rows={4} placeholder="Description" value={f.description} onChange={(e) => set("description", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-500">Type{sel("type", TYPES, (v) => TYPE_LABEL[v as keyof typeof TYPE_LABEL])}</label>
          <label className="text-xs font-medium text-slate-500">Priority{sel("priority", PRIORITIES, (v) => PRIORITY_LABEL[v as keyof typeof PRIORITY_LABEL])}</label>
          <label className="text-xs font-medium text-slate-500">Status{sel("status", STATUSES, (v) => STATUS_LABEL[v as keyof typeof STATUS_LABEL])}</label>
          <label className="text-xs font-medium text-slate-500">Assignee
            <select className={inputCls} value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
              <option value="">Unassigned</option>{members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">Due date<input type="date" className={inputCls} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-500">Labels (comma separated)<input className={inputCls} value={f.labels} onChange={(e) => set("labels", e.target.value)} /></label>
        </div>
        {m.error && <p className="text-sm text-rose-600">{(m.error as Error).message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={m.isPending || !project}>Create ticket</button>
        </div>
      </form>
    </Modal>
  );
}
