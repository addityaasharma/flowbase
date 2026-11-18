"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES, type Role } from "@bitcode/shared";
import { Check, Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { DeleteProjectModal } from "@/components/DeleteProjectModal";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Avatar, Modal, btnGhost, btnPrimary, inputCls } from "@/components/Bits";

type InviteResult = { id: string; email: string; link: string; emailSent: boolean; emailError?: string };
type Pending = { id: string; email: string; role: Role; expiresAt: string; invitedBy: { name: string } };

function InviteResultCard({ r }: { r: InviteResult }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      {r.emailSent
        ? <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="h-4 w-4" />Invitation emailed to <b>{r.email}</b></p>
        : <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Email wasn’t sent: {r.emailError}. Share this link with them directly instead.</p>}
      <div className="flex gap-2">
        <input readOnly className={inputCls} value={r.link} onFocus={(e) => e.target.select()} />
        <button className={btnGhost} onClick={() => { navigator.clipboard?.writeText(r.link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { project } = useWorkspace();
  const [email, setEmail] = useState("");
  const m = useMutation({
    // new people always join as members; a project admin can change the role afterwards
    mutationFn: () => api<InviteResult>("/invitations", { method: "POST", json: { email, role: "MEMBER", projectId: project!.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations"] }),
  });
  return (
    <Modal title="Add member" onClose={onClose}>
      {m.data ? (
        <div className="space-y-4"><InviteResultCard r={m.data} />
          <div className="flex justify-end"><button className={btnPrimary} onClick={onClose}>Done</button></div></div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <p className="text-sm text-slate-500">Enter their email. They’ll get a link to join <b>{project?.name}</b>. Only invited people can see this project.</p>
          <input autoFocus type="email" className={inputCls} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {m.error && <p className="text-sm text-rose-600">{(m.error as Error).message}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
            <button className={btnPrimary} disabled={m.isPending}><Mail className="h-4 w-4" />{m.isPending ? "Sending…" : "Add & send invite"}</button></div>
        </form>
      )}
    </Modal>
  );
}

function PendingInvites({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<InviteResult | null>(null);
  const q = useQuery({ queryKey: ["invitations", projectId], queryFn: () => api<Pending[]>(`/invitations?projectId=${projectId}`) });
  const resend = useMutation({
    mutationFn: (p: Pending) => api<Omit<InviteResult, "id" | "email">>(`/invitations/${p.id}/resend`, { method: "POST" }).then((r) => ({ ...r, id: p.id, email: p.email })),
    onSuccess: setResult,
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations"] }) });
  if (!q.data?.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-600">Pending invitations ({q.data.length})</h3>
      <div className="divide-y divide-slate-100 rounded-[24px] bg-white shadow-card">
        {q.data.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div><div className="font-medium">{p.email}</div><div className="text-xs text-slate-500">invited by {p.invitedBy.name} · expires {new Date(p.expiresAt).toLocaleDateString()}</div></div>
            <div className="flex gap-3 text-xs font-medium">
              <button className="text-indigo-600 hover:underline" disabled={resend.isPending} onClick={() => resend.mutate(p)}>Resend</button>
              <button className="text-slate-500 hover:text-rose-600" onClick={() => revoke.mutate(p.id)}>Revoke</button>
            </div>
          </div>
        ))}
      </div>
      {result && <Modal title="Invitation resent" onClose={() => setResult(null)}><InviteResultCard r={result} /></Modal>}
    </div>
  );
}

export default function Team() {
  const { user } = useAuth();
  const { project, members, myRole, canManage } = useWorkspace();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = myRole === "ADMIN";
  const refresh = () => qc.invalidateQueries({ queryKey: ["projects"] });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api(`/projects/${project!.id}/members/${id}`, { method: "PATCH", json: { role } }),
    onSuccess: refresh, onError: (e) => alert((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/projects/${project!.id}/members/${id}`, { method: "DELETE" }),
    onSuccess: refresh, onError: (e) => alert((e as Error).message),
  });
  if (!project) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Team & Roles ({members.length})</h2>
        {canManage && <button className={btnPrimary} onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" />Add member</button>}
      </div>
      {canManage && <PendingInvites projectId={project.id} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((u) => (
          <div key={u.id} className="flex items-center gap-4 rounded-[24px] bg-white p-5 shadow-card transition hover:shadow-lift">
            <Avatar user={u} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{u.name}{u.id === user?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}</div>
              <div className="truncate text-sm text-slate-500">{u.email}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {isAdmin ? (
                <select className="rounded-md border border-slate-200 px-2 py-1 text-xs" value={u.role} onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
              ) : <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{u.role}</span>}
              {u.id === user?.id
                ? <button className="text-xs text-slate-500 hover:text-rose-600" onClick={() => confirm("Leave this project?") && remove.mutate(u.id)}>Leave</button>
                : isAdmin && <button className="text-xs text-slate-500 hover:text-rose-600" onClick={() => confirm(`Remove ${u.name} from this project?`) && remove.mutate(u.id)}>Remove</button>}
            </div>
          </div>
        ))}
      </div>
      {isAdmin && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-rose-200 bg-rose-50/50 p-5">
          <div><h3 className="font-semibold text-rose-700">Danger zone</h3><p className="text-sm text-slate-600">Deleting this project permanently removes its tickets, comments and members.</p></div>
          <button className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete project</button>
        </section>
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {deleting && <DeleteProjectModal project={project} onClose={() => setDeleting(false)} />}
    </div>
  );
}
