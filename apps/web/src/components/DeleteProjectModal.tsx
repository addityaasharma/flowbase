"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import type { Project } from "@/lib/types";
import { Modal, btnGhost, inputCls } from "./Bits";

/** Permanent delete, guarded by typing the project's name. Only offered to the project's admin. */
export function DeleteProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useRealtime();
  const [typed, setTyped] = useState("");
  const del = useMutation({
    mutationFn: () => api(`/projects/${project.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      qc.removeQueries({ queryKey: ["tickets", project.id] });
      notify(`Deleted the project “${project.name}”.`, "deleted");
      onClose();
    },
  });
  const ok = typed.trim() === project.name;
  const n = project._count.tickets;
  return (
    <Modal title="Delete project" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) del.mutate(); }}>
        <p className="flex items-start gap-2.5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This permanently deletes <b>{project.name}</b>, its {n} ticket{n === 1 ? "" : "s"}, all comments and pending invitations, and removes all {project.members.length} member{project.members.length === 1 ? "" : "s"}. This can’t be undone.</span>
        </p>
        <label className="block text-sm text-slate-600">Type <b className="select-all text-slate-900">{project.name}</b> to confirm
          <input autoFocus className={inputCls + " mt-1.5"} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={project.name} />
        </label>
        {del.error && <p className="text-sm text-rose-600">{(del.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button disabled={!ok || del.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
            {del.isPending ? "Deleting…" : "Delete forever"}</button>
        </div>
      </form>
    </Modal>
  );
}
