"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@bitcode/shared";
import { Bell, Bot, Check, ChevronDown, Copy, CornerDownRight, GitBranch, Github, Lock, Pencil, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { fmtTime } from "@/lib/tones";
import type { Comment, SubtaskRow, TicketDetail } from "@/lib/types";
import { AssigneePicker, Avatar, PriorityPill, StatusPill, TypeIcon, btnGhost, btnPrimary, inputCls } from "./Bits";
import { Markdown } from "./Markdown";
import { RichEditor } from "./RichEditor";

const SUB_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", REVIEW: "Review", DONE: "Done" } as const;
const SUB_TONE = { TODO: "bg-slate-100 text-slate-600", IN_PROGRESS: "bg-sky-100 text-sky-700", REVIEW: "bg-amber-100 text-amber-700", DONE: "bg-emerald-100 text-emerald-700" } as const;

/** Multi-select of people (a compact dropdown with checkboxes). */
function PeoplePicker({ people, value, onChange }: { people: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  const names = people.filter((p) => value.includes(p.id)).map((p) => p.name.split(" ")[0]);
  return (
    <details className="relative">
      <summary className="max-w-[8rem] cursor-pointer list-none truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-200">{names.length ? names.join(", ") : "Anyone"}</summary>
      <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl bg-white p-1.5 shadow-lift ring-1 ring-slate-200">
        {people.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">Assign people to the ticket first</p>}
        {people.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
            <input type="checkbox" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))} />{p.name}
          </label>
        ))}
      </div>
    </details>
  );
}

/** Checklist inside the ticket, with a progress bar. Only people who can edit the ticket can change it. */
function Subtasks({ ticketId, items, canEdit, refresh, assignees, userId, onReply }: { ticketId: string; items: SubtaskRow[]; canEdit: boolean; refresh: () => void; assignees: { id: string; name: string }[]; userId?: string; onReply: (s: SubtaskRow) => void }) {
  const [text, setText] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const add = useMutation({ mutationFn: (title: string) => api(`/tickets/${ticketId}/subtasks`, { method: "POST", json: { title, assigneeIds: who } }), onSuccess: () => { setText(""); setWho([]); refresh(); } });
  const assign = useMutation({ mutationFn: (v: { id: string; assigneeIds: string[] }) => api(`/subtasks/${v.id}`, { method: "PATCH", json: { assigneeIds: v.assigneeIds } }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (v: { id: string; status: SubtaskRow["status"] }) => api(`/subtasks/${v.id}`, { method: "PATCH", json: { status: v.status } }), onSuccess: refresh });
  const remind = useMutation({ mutationFn: (id: string) => api(`/subtasks/${id}/remind`, { method: "POST" }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/subtasks/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const done = items.filter((s) => s.done).length;
  if (!items.length && !canEdit) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Subtasks {items.length > 0 && <span className="font-normal text-slate-400">({done}/{items.length})</span>}</h3></div>
      {items.length > 0 && <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${(done / items.length) * 100}%` }} /></div>}
      <ul className="space-y-1">
        {items.map((s) => {
          const mine = s.assigneeIds.length ? !!userId && s.assigneeIds.includes(userId) : canEdit; // only the assigned person ticks it
          const owners = assignees.filter((a) => s.assigneeIds.includes(a.id));
          return (
          <li key={s.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-50">
            <button type="button" disabled={!mine} title={mine ? undefined : owners.length ? `Only ${owners.map((o) => o.name).join(", ")} can check this` : undefined} aria-label={s.done ? "Mark as not done" : "Mark as done"} onClick={() => toggle.mutate({ id: s.id, status: s.done ? "TODO" : "DONE" })}
              className={clsx("flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-2 transition", s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-indigo-400", !mine && "cursor-not-allowed opacity-50")}>{s.done && <Check className="h-3 w-3" strokeWidth={3} />}</button>
            <span className={clsx("min-w-0 flex-1 break-words text-sm", s.done && "text-slate-400 line-through")}>{s.title}</span>
            <select disabled={!mine} value={s.status} onChange={(e) => toggle.mutate({ id: s.id, status: e.target.value as SubtaskRow["status"] })} aria-label="Subtask status" title={mine ? undefined : "Only the assignees can change the status"}
              className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium outline-none disabled:opacity-60", SUB_TONE[s.status])}>
              {(Object.keys(SUB_LABEL) as SubtaskRow["status"][]).map((k) => <option key={k} value={k}>{SUB_LABEL[k]}</option>)}
            </select>
            {canEdit ? <PeoplePicker people={assignees} value={s.assigneeIds} onChange={(ids) => assign.mutate({ id: s.id, assigneeIds: ids })} />
              : owners.length > 0 && <span className="max-w-[9rem] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{owners.map((o) => o.name).join(", ")}</span>}
            {canEdit && !s.done && s.assigneeIds.length > 0 && (
              <button type="button" disabled={!!s.remindedAt || remind.isPending} onClick={() => remind.mutate(s.id)} aria-label="Send reminder email" title={s.remindedAt ? "Reminder already sent" : "Email the assignees a reminder (once)"}
                className={clsx("transition", s.remindedAt ? "cursor-not-allowed text-amber-400" : "text-slate-300 hover:text-amber-500")}><Bell className="h-4 w-4" fill={s.remindedAt ? "currentColor" : "none"} /></button>
            )}
            {userId && <button type="button" aria-label="Reply to this subtask" title="Reply in comments" onClick={() => onReply(s)} className="text-slate-300 hover:text-indigo-600"><CornerDownRight className="h-4 w-4" /></button>}
            {canEdit && <button type="button" aria-label="Remove subtask" onClick={() => remove.mutate(s.id)} className="hidden text-slate-300 hover:text-rose-600 group-hover:block"><X className="h-4 w-4" /></button>}
          </li>
        );})}
      </ul>
      {canEdit && (
        <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !add.isPending) add.mutate(text.trim()); }}>
          <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Add a subtask and press Enter" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3.5 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/15" />
          <PeoplePicker people={assignees} value={who} onChange={setWho} />
          {add.error && <p className="mt-1 text-xs text-rose-600">{(add.error as Error).message}</p>}
        </form>
      )}
    </section>
  );
}

/** Add a label with Enter or comma; click × to remove. */
function LabelsEditor({ labels, onChange }: { labels: string[]; onChange: (l: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => { const v = text.trim().replace(/,/g, "").slice(0, 30); if (v && !labels.includes(v) && labels.length < 12) onChange([...labels, v]); setText(""); };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span key={l} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{l}
          <button type="button" aria-label={`Remove ${l}`} onClick={() => onChange(labels.filter((x) => x !== l))} className="text-slate-400 hover:text-rose-600 disabled:hidden"><X className="h-3 w-3" /></button></span>
      ))}
      <input value={text} onChange={(e) => (e.target.value.endsWith(",") ? (setText(e.target.value), add()) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} placeholder={labels.length ? "Add…" : "Add a label"}
        className="min-w-20 flex-1 rounded-full bg-transparent px-2 py-1 text-xs outline-none placeholder:text-slate-400 disabled:hidden" />
    </div>
  );
}

const ViaBadge = ({ name }: { name?: string | null }) => name ? <span title={`Written by an agent using the token “${name}” on this person's behalf`} className="ml-1 inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-px align-middle text-[10px] font-medium text-violet-700"><Bot className="h-3 w-3" />via {name}</span> : null;

/**
 * Where to work: repos attached to this task by the people working on it, then the project's default repo.
 * Anyone who can edit the task (assignees, creator) can attach their own repo (a fork, another repo...) and pick which one to use.
 */
function DevBox({ t, canEdit, refresh }: { t: TicketDetail; canEdit: boolean; refresh: () => void }) {
  const [copied, setCopied] = useState("");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const slug = t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const newBranch = `flowbase/${t.key.toLowerCase()}-${slug}`.replace(/-$/, "");
  const copy = (id: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); };
  const add = useMutation({ mutationFn: () => api(`/tickets/${t.id}/repos`, { method: "POST", json: { url, branch } }), onSuccess: () => { setUrl(""); setBranch(""); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api(`/ticket-repos/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const repos = [
    ...t.repos.map((r) => ({ id: r.id, url: r.url, branch: r.branch ?? t.project.repoBranch ?? null, note: `added by ${r.addedBy.name}`, removable: true })),
    ...(t.project.repoUrl && !t.repos.some((r) => r.url === t.project.repoUrl) ? [{ id: "project", url: t.project.repoUrl, branch: t.project.repoBranch ?? null, note: "project default", removable: false }] : []),
  ];
  const clone = (r: { url: string; branch: string | null }) => `git clone ${r.branch ? `-b ${r.branch} ` : ""}${r.url}.git && cd ${r.url.split("/").pop()} && git checkout -b ${newBranch}`;
  return (
    <div className="rounded-3xl bg-slate-50 p-5">
      <Label>Developer</Label>
      {repos.length === 0 && <p className="mb-2 text-xs text-slate-400">No GitHub repo yet. {canEdit ? "Attach one below." : "Someone working on this task can attach one."}</p>}
      <ul className="mb-2 space-y-1.5">
        {repos.map((r) => (
          <li key={r.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <div className="flex items-center gap-2">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"><Github className="h-4 w-4 shrink-0" /><span className="truncate">{r.url.replace("https://github.com/", "")}</span></a>
              <button type="button" title="Copy a command that clones this repo and creates the branch" onClick={() => copy(r.id, clone(r))} className="text-slate-400 hover:text-indigo-600">{copied === r.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
              {canEdit && r.removable && <button type="button" aria-label="Remove repository" onClick={() => remove.mutate(r.id)} className="text-slate-300 hover:text-rose-600"><X className="h-4 w-4" /></button>}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">{r.note}{r.branch ? ` · base ${r.branch}` : ""}</div>
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="mb-2 space-y-1.5" onSubmit={(e) => { e.preventDefault(); if (url.trim() && !add.isPending) add.mutate(); }}>
          <div className="flex gap-1.5">
            <input value={url} maxLength={200} onChange={(e) => setUrl(e.target.value)} placeholder="Attach a GitHub repo (https://github.com/owner/repo)" className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-xs outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400" />
            <input value={branch} maxLength={60} onChange={(e) => setBranch(e.target.value)} placeholder="branch" className="w-20 rounded-xl bg-white px-3 py-2 text-xs outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400" />
            <button className="rounded-xl bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50" disabled={!url.trim() || add.isPending}>Add</button>
          </div>
          {add.error && <p className="text-xs text-rose-600">{(add.error as Error).message}</p>}
        </form>
      )}
      <button type="button" onClick={() => copy("branch", newBranch)} className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left font-mono text-xs text-slate-700 ring-1 ring-slate-200 hover:ring-indigo-300" title="Copy branch name">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate">{newBranch}</span>{copied === "branch" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
      </button>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>;

/** Ticket details: a wide two-column panel. Left: title, description, comments. Right: properties and activity. */
export function TicketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { user, requireAuth } = useAuth();
  const { members, openTicket, toneOf } = useWorkspace();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const q = useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`), refetchInterval: 30000 }); // live updates arrive over the event stream; this is a safety net
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ticket", id] }); qc.invalidateQueries({ queryKey: ["tickets"] }); };
  const patch = useMutation({ mutationFn: (json: object) => api(`/tickets/${id}`, { method: "PATCH", json }), onSuccess: refresh });
  const addComment = useMutation({
    mutationFn: () => api(`/tickets/${id}/comments`, { method: "POST", json: { body: comment } }),
    onSuccess: () => { setComment(""); refresh(); },
  });
  const reply = useMutation({
    mutationFn: (v: { parentId: string; body: string }) => api(`/tickets/${id}/comments`, { method: "POST", json: v }),
    onSuccess: () => { setReplyTo(null); setReplyText(""); refresh(); },
  });
  const del = useMutation({ mutationFn: () => api(`/tickets/${id}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); openTicket(null); } });
  useEffect(() => { setEditingDesc(false); setShowActivity(false); setComment(""); setReplyTo(null); setReplyText(""); }, [id]);

  const t = q.data;
  const canDelete = !!user && !!t && t.reporter.id === user.id;                                                   // only the creator can delete
  const canEdit = !!user && !!t && (t.reporter.id === user.id || t.assignees.some((a) => a.id === user.id));     // an assignee or the creator; others can comment
  const sendReply = () => { if (replyTo && replyText.trim() && !reply.isPending) reply.mutate({ parentId: replyTo.id, body: replyText }); };
  const startReply = (c: Comment, isReply: boolean) => { setReplyTo({ id: c.id, name: c.author.name }); setReplyText(isReply ? `@[${c.author.name}](u:${c.author.id}) ` : ""); };
  const send = () => { if (comment.trim() && !addComment.isPending) addComment.mutate(); };
  const startEdit = () => { setDescDraft(t?.description ?? ""); setEditingDesc(true); };
  const saveDesc = () => patch.mutate({ description: descDraft }, { onSuccess: () => setEditingDesc(false) });

  const renderComment = (c: Comment, isReply: boolean) => {
    const tone = toneOf(c.author.id);
    return (
      <div key={c.id} className="flex gap-2">
        <Avatar user={c.author} size={isReply ? 20 : 24} />
        <div className="min-w-0 flex-1">
          <div className={clsx("rounded-xl border px-3 py-2", tone.soft, tone.border)}>
            <div className="mb-0.5 text-[11px]"><b className={tone.text}>{c.author.name}</b><ViaBadge name={c.viaAgent} /> <span className="text-slate-400">· {fmtTime(c.createdAt)}</span></div>
            <div className="text-[13px] leading-snug [&_*]:!text-[13px] [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0"><Markdown source={c.body} /></div>
          </div>
          {user && replyTo?.id !== c.id && (
            <button onClick={() => startReply(c, isReply)} className="ml-2 mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600"><CornerDownRight className="h-3 w-3" />Reply</button>
          )}
          {replyTo?.id === c.id && (
            <div className="mt-2 space-y-2">
              <RichEditor value={replyText} onChange={setReplyText} rows={2} autoFocus placeholder={`Reply to ${c.author.name}… (Ctrl+Enter to send)`} onSubmit={sendReply} />
              <div className="flex justify-end gap-2">
                <button className={btnGhost + " !px-4 !py-1.5"} onClick={() => setReplyTo(null)}>Cancel</button>
                <button className={btnPrimary + " !px-4 !py-1.5"} disabled={!replyText.trim() || reply.isPending} onClick={sendReply}>{reply.isPending ? "Sending…" : "Reply"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="anim-fade fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="anim-slide flex h-full w-full flex-col overflow-hidden bg-white shadow-lift sm:w-[96vw] sm:max-w-[2000px] sm:rounded-l-[32px]" onMouseDown={(e) => e.stopPropagation()}>
        {!t ? <p className="p-8 text-slate-500">Loading…</p> : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-8 py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-500">
                <TypeIcon t={t.type} />{t.key}<StatusPill s={t.status} /><PriorityPill p={t.priority} />
                <span className="ml-1 hidden min-w-0 items-center gap-1.5 text-xs font-normal text-slate-400 md:flex">
                  <span className="h-3.5 w-px bg-slate-200" />
                  <span>Reported by <b className={"font-semibold " + toneOf(t.reporter.id).text}>{t.reporter.name}</b></span>
                  <span>· Created {fmtTime(t.createdAt)}</span>
                  <span>· Updated {fmtTime(t.updatedAt)}</span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                {canDelete && <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => confirm("Delete this ticket? This can’t be undone.") && del.mutate()}><Trash2 className="h-4 w-4" />Delete</button>}
                <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
            </header>

            {/* wide screens: two columns that scroll on their own; narrow screens: one scroll */}
            <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_340px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
              <>
                {/* ---------- main column ---------- */}
                <div className="min-w-0 space-y-7 p-8 lg:min-h-0 lg:overflow-y-auto">
                  {user && !canEdit && (
                    <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><Lock className="mt-0.5 h-4 w-4 shrink-0" />You can’t edit this ticket because it isn’t assigned to you. Only its assignees or the person who created it can change it. You can still comment below.</p>
                  )}
                  <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
                    <input key={t.updatedAt + "title"} className="w-full rounded-xl border border-transparent px-2 py-1 text-2xl font-semibold tracking-tight hover:border-slate-200 focus:border-indigo-500 focus:outline-none disabled:hover:border-transparent"
                      defaultValue={t.title} onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && patch.mutate({ title: e.target.value.trim() })} />
                  </fieldset>

                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Description</h3>
                      {canEdit && !editingDesc && t.description && <button onClick={startEdit} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600"><Pencil className="h-3.5 w-3.5" />Edit</button>}
                    </div>
                    {editingDesc ? (
                      <div className="space-y-2">
                        <RichEditor value={descDraft} onChange={setDescDraft} rows={8} autoFocus placeholder="Describe the task. Use bullets, checklists, or paste an image." onSubmit={saveDesc} />
                        <div className="flex justify-end gap-2">
                          <button className={btnGhost} onClick={() => setEditingDesc(false)}>Cancel</button>
                          <button className={btnPrimary} disabled={patch.isPending} onClick={saveDesc}>{patch.isPending ? "Saving…" : "Save"}</button>
                        </div>
                      </div>
                    ) : t.description ? (
                      <div className="rounded-2xl bg-slate-50 px-5 py-4"><Markdown source={t.description} /></div>
                    ) : canEdit ? (
                      <button onClick={startEdit} className="w-full rounded-2xl border border-dashed border-slate-300 px-5 py-7 text-left text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-600">Add a description… bullets, checklists and images are supported</button>
                    ) : <p className="text-sm text-slate-400">No description</p>}
                  </section>

                  <Subtasks ticketId={t.id} items={t.subtasks} canEdit={canEdit} refresh={refresh} assignees={t.assignees} userId={user?.id} onReply={(s) => setComment((c) => (c ? c + "\n" : "") + `> Re subtask “${s.title}”${s.done ? " (done)" : ""}\n\n`)} />
                </div>

                {/* ---------- comments column ---------- */}
                <div className="min-w-0 space-y-7 border-slate-100 p-8 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:px-6">
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Comments <span className="font-normal text-slate-400">({t.comments.length})</span></h3>
                    <div className="space-y-2.5">
                      {t.comments.filter((c) => !c.parentId).map((c) => {
                        const replies = t.comments.filter((r) => r.parentId === c.id);
                        return (
                          <div key={c.id}>
                            {renderComment(c, false)}
                            {replies.length > 0 && <div className="ml-7 mt-1.5 space-y-1.5 border-l-2 border-slate-100 pl-3">{replies.map((r) => renderComment(r, true))}</div>}
                          </div>
                        );
                      })}
                    </div>
                    {user ? (
                      <div className="mt-3 space-y-2">
                        <RichEditor value={comment} onChange={setComment} rows={2} placeholder="Write a comment… (Ctrl+Enter to send)" onSubmit={send} />
                        <div className="flex justify-end"><button className={btnPrimary} disabled={!comment.trim() || addComment.isPending} onClick={send}>{addComment.isPending ? "Sending…" : "Comment"}</button></div>
                      </div>
                    ) : (
                      <button onClick={() => requireAuth()} className="mt-4 w-full rounded-full bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100">Sign in to comment</button>
                    )}
                  </section>
                </div>

                {/* ---------- side column ---------- */}
                <div className="min-w-0 space-y-5 p-8 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-slate-100 lg:pl-6">
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
                      <div><Label>Status</Label>
                        <select className={inputCls + " bg-white"} value={t.status} onChange={(e) => patch.mutate({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
                      <div><Label>Priority</Label>
                        <select className={inputCls + " bg-white"} value={t.priority} onChange={(e) => patch.mutate({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></div>
                      <div><Label>Assigned to · {t.assignees.length} {t.assignees.length === 1 ? "person" : "people"}</Label>
                        <AssigneePicker members={members} value={t.assignees.map((a) => a.id)} disabled={!canEdit} onChange={(ids) => patch.mutate({ assigneeIds: ids })} /></div>
                      <div><Label>Due date</Label>
                        <input type="date" className={inputCls + " bg-white"} value={t.dueDate?.slice(0, 10) ?? ""} onChange={(e) => patch.mutate({ dueDate: e.target.value || null })} /></div>
                      <div><Label>Labels</Label><LabelsEditor labels={t.labels} onChange={(labels) => patch.mutate({ labels })} /></div>
                    </fieldset>
                  </div>

                  <DevBox t={t} canEdit={canEdit} refresh={refresh} />

                  <section className="px-1">
                    <button type="button" onClick={() => setShowActivity((v) => !v)} aria-expanded={showActivity}
                      className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-sm font-semibold hover:bg-slate-50">
                      <span>Activity <span className="font-normal text-slate-400">({t.activities.length})</span></span>
                      <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition-transform duration-200", showActivity && "rotate-180")} />
                    </button>
                    {showActivity && (
                      <ol className="anim-fade ml-2 mt-3 max-h-96 space-y-3.5 overflow-y-auto border-l-2 border-slate-100 pl-5 pr-1">
                        {t.activities.map((a) => {
                          const tone = toneOf(a.actor.id);
                          return (
                            <li key={a.id} className="relative">
                              <span className={clsx("absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", tone.dot)} />
                              <p className="text-sm leading-snug"><b className={tone.text}>{a.actor.name}</b><ViaBadge name={a.viaAgent} /> <span className="text-slate-600">{a.message}</span></p>
                              <p className="text-xs text-slate-400">{fmtTime(a.createdAt)}</p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </section>
                </div>
              </>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
