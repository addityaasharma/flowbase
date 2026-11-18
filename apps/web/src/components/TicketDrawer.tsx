"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@bitcode/shared";
import { ChevronDown, CornerDownRight, Lock, Pencil, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { fmtTime } from "@/lib/tones";
import type { Comment, TicketDetail } from "@/lib/types";
import { AssigneePicker, Avatar, PriorityPill, StatusPill, TypeIcon, btnGhost, btnPrimary, inputCls } from "./Bits";
import { Markdown } from "./Markdown";
import { RichEditor } from "./RichEditor";

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
      <div key={c.id} className="flex gap-2.5">
        <Avatar user={c.author} size={isReply ? 24 : 28} />
        <div className="min-w-0 flex-1">
          <div className={clsx("rounded-2xl border px-4 py-3", tone.soft, tone.border)}>
            <div className="mb-1 text-xs"><b className={tone.text}>{c.author.name}</b> <span className="text-slate-400">· {fmtTime(c.createdAt)}</span></div>
            <Markdown source={c.body} />
          </div>
          {user && replyTo?.id !== c.id && (
            <button onClick={() => startReply(c, isReply)} className="ml-2 mt-1 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600"><CornerDownRight className="h-3 w-3" />Reply</button>
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
      <aside className="anim-slide flex h-full w-full flex-col overflow-hidden bg-white shadow-lift sm:w-[65vw] sm:min-w-[min(100%,720px)] sm:max-w-[1400px] sm:rounded-l-[32px]" onMouseDown={(e) => e.stopPropagation()}>
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
            <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
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

                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Comments <span className="font-normal text-slate-400">({t.comments.length})</span></h3>
                    <div className="space-y-4">
                      {t.comments.filter((c) => !c.parentId).map((c) => {
                        const replies = t.comments.filter((r) => r.parentId === c.id);
                        return (
                          <div key={c.id}>
                            {renderComment(c, false)}
                            {replies.length > 0 && <div className="ml-9 mt-2 space-y-2 border-l-2 border-slate-100 pl-4">{replies.map((r) => renderComment(r, true))}</div>}
                          </div>
                        );
                      })}
                    </div>
                    {user ? (
                      <div className="mt-4 space-y-2">
                        <RichEditor value={comment} onChange={setComment} rows={3} placeholder="Write a comment… (Ctrl+Enter to send)" onSubmit={send} />
                        <div className="flex justify-end"><button className={btnPrimary} disabled={!comment.trim() || addComment.isPending} onClick={send}>{addComment.isPending ? "Sending…" : "Comment"}</button></div>
                      </div>
                    ) : (
                      <button onClick={() => requireAuth()} className="mt-4 w-full rounded-full bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100">Sign in to comment</button>
                    )}
                  </section>
                </div>

                {/* ---------- side column ---------- */}
                <div className="min-w-0 space-y-5 p-8 lg:min-h-0 lg:overflow-y-auto lg:pl-4">
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
                              <p className="text-sm leading-snug"><b className={tone.text}>{a.actor.name}</b> <span className="text-slate-600">{a.message}</span></p>
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
