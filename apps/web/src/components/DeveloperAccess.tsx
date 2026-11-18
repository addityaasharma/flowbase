"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { fmtTime } from "@/lib/tones";
import type { ApiTokenRow } from "@/lib/types";
import { Modal, btnGhost, btnPrimary, inputCls } from "./Bits";

type Created = ApiTokenRow & { token: string };
const mcpUrl = () => new URL(API_BASE + "/mcp", location.origin).toString();

function CopyBox({ text, label, prose }: { text: string; label: string; prose?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-2xl bg-slate-900 p-3 text-slate-100">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}
        <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 normal-case tracking-normal text-slate-200 hover:bg-white/20">
          {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : "Copy"}</button></div>
      <pre className={"overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed " + (prose ? "break-words" : "break-all")}>{text}</pre>
    </div>
  );
}

/** Create/revoke personal access tokens and show how to connect Claude Code. */
export function DeveloperAccess({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("Claude Code");
  const [days, setDays] = useState<0 | 30 | 90 | 365>(90);
  const [others, setOthers] = useState(true);
  const [level, setLevel] = useState<"tasks" | "collaborator" | "full">("collaborator");
  const [created, setCreated] = useState<Created | null>(null);
  const list = useQuery({ queryKey: ["tokens"], queryFn: () => api<ApiTokenRow[]>("/tokens") });
  const create = useMutation({
    mutationFn: () => api<Created>("/tokens", { method: "POST", json: { name, expiresInDays: days, canCommentOthers: level === "tasks" ? others : true, level } }),
    onSuccess: (t) => { setCreated(t); qc.invalidateQueries({ queryKey: ["tokens"] }); },
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/tokens/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }) });
  const cmd = (t: string) => `claude mcp add --transport http flowbase ${mcpUrl()} --header "Authorization: Bearer ${t}"`;
  const prompt = "Use the flowbase tools: list my tasks, pick the highest-priority open one and read it in full. Clone the project's GitHub repo, create the suggested branch, implement the task and run the tests. Push the branch and open a pull request, then comment on the task with the PR link and move it to IN_REVIEW.";

  return (
    <Modal title="Developer access" onClose={onClose} wide>
      <div className="space-y-5 text-sm">
        <p className="text-slate-600">Let <b>Claude Code</b> (or any MCP client) work in Flowbase as you. Pick how much it may do: from just your assigned tasks, up to everything you can do after login. It never exceeds your own rights, never touches your password or sign-in, and everything it does is labelled “via” the token name.</p>

        {created ? (
          <div className="space-y-3 rounded-3xl bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-800">Token “{created.name}” created. Copy it now: it won’t be shown again.</p>
            <CopyBox label="Your token" text={created.token} />
            <p className="font-semibold">1 · Connect Claude Code (run once in your terminal)</p>
            <CopyBox label="Command" text={cmd(created.token)} />
            <p className="font-semibold">2 · Then ask Claude</p>
            <CopyBox label="Example prompt" text={prompt} prose />
            <p className="text-xs text-slate-500">Claude does the work on your machine with your own git access, so it needs a repo: the project default (<b>Team &amp; Roles → Project settings</b>) or one you attach to the task in its <b>Developer</b> box. Keep the token secret like a password. You can revoke it below at any time.</p>
            <button className={btnPrimary} onClick={() => setCreated(null)}>Done</button>
          </div>
        ) : (
          <form className="space-y-3 rounded-3xl bg-slate-50 p-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <h3 className="font-semibold">New access token</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-500">Name<input className={inputCls + " mt-1 bg-white"} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required /></label>
              <label className="text-xs font-medium text-slate-500">Expires<select className={inputCls + " mt-1 bg-white"} value={days} onChange={(e) => setDays(Number(e.target.value) as typeof days)}>
                <option value={30}>in 30 days</option><option value={90}>in 90 days</option><option value={365}>in 1 year</option><option value={0}>never</option></select></label>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-xs font-medium text-slate-500">Access level</legend>
              {([
                ["tasks", "Tasks only", "Reads your assigned tasks, comments, moves your tasks. Nothing else."],
                ["collaborator", "Collaborator (recommended)", "Works like a teammate: reads every task in your projects, comments, raises and edits tickets, assigns several people, moves tasks, subtasks, repos."],
                ["full", "Full access", "Everything you can do after login, including deleting tickets, managing projects, members and invitations. Never your password, tokens or sign-in."],
              ] as const).map(([v, t, d]) => (
                <label key={v} className={"flex cursor-pointer items-start gap-2.5 rounded-2xl border p-3 " + (level === v ? "border-indigo-500 bg-white" : "border-slate-200 bg-white")}>
                  <input type="radio" name="level" className="mt-1 accent-indigo-600" checked={level === v} onChange={() => setLevel(v)} />
                  <span><b>{t}</b><span className="block text-xs text-slate-500">{d}</span></span>
                </label>))}
              {level === "full" && <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">Claude will be able to delete and change things as you. Everything it does is labelled “via {name || "token"}”, and it never exceeds your own rights (a member token can’t do admin things).</p>}
            </fieldset>
            {level === "tasks" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-indigo-600" checked={others} onChange={(e) => setOthers(e.target.checked)} />
              <span><b>Allow commenting on tasks not assigned to me.</b> <span className="text-slate-500">Claude can then read and comment on other tasks in my projects (like any team member), but not change them. Turn off to limit it to my assigned tasks only.</span></span></label>}
            {create.error && <p className="text-rose-600">{(create.error as Error).message}</p>}
            <button className={btnPrimary} disabled={create.isPending}><KeyRound className="h-4 w-4" />{create.isPending ? "Creating…" : "Create token"}</button>
          </form>
        )}

        <div>
          <h3 className="mb-2 font-semibold">Your tokens</h3>
          {list.data?.length === 0 && <p className="text-slate-400">No active tokens.</p>}
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {list.data?.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0"><div className="font-medium">{t.name} <code className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t.prefix}…</code></div>
                  <div className="text-xs text-slate-500">{t.level === "full" ? "Full access" : t.level === "collaborator" ? "Collaborator" : t.canCommentOthers ? "Assigned tasks + comment on others" : "Assigned tasks only"} · {t.lastUsedAt ? `last used ${fmtTime(t.lastUsedAt)}` : "never used"} · {t.expiresAt ? `expires ${new Date(t.expiresAt).toLocaleDateString()}` : "no expiry"}</div></div>
                <button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50" onClick={() => confirm(`Revoke “${t.name}”? Anything using it stops working immediately.`) && revoke.mutate(t.id)}><Trash2 className="h-3.5 w-3.5" />Revoke</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end"><button className={btnGhost} onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  );
}
