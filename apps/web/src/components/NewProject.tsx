"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Modal, btnGhost, btnPrimary, inputCls } from "./Bits";

const suggestKey = (name: string) => {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "")).slice(0, 6);
};

export function NewProject({ onClose }: { onClose: () => void }) {
  const { setProjectId } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const m = useMutation({
    mutationFn: () => api<{ id: string }>("/projects", { method: "POST", json: { name, key, description: description || undefined } }),
    onSuccess: async (p) => { await qc.invalidateQueries({ queryKey: ["projects"] }); setProjectId(p.id); onClose(); },
  });

  return (
    <Modal title="Create new project" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <input autoFocus className={inputCls} placeholder="Project name" value={name} required
          onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(suggestKey(e.target.value)); }} />
        <label className="block text-xs font-medium text-slate-500">Ticket key (2–6 capital letters, e.g. BIT-12)
          <input className={inputCls} value={key} maxLength={6} pattern="[A-Z]{2,6}" required
            onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()); }} /></label>
        <textarea className={inputCls} rows={3} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <p className="text-xs text-slate-500">You’ll be the admin of this project. Invite teammates by email from the Team tab.</p>
        {m.error && <p className="text-sm text-rose-600">{(m.error as Error).message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={m.isPending}>Create project</button>
        </div>
      </form>
    </Modal>
  );
}
