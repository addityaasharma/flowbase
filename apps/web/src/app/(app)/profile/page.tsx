"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bot, Check, ChevronDown, FolderPlus, LogOut, Trash2 } from "lucide-react";
import clsx from "clsx";
import { DeleteProjectModal } from "@/components/DeleteProjectModal";
import { DeveloperAccess } from "@/components/DeveloperAccess";
import { AppSettings } from "@/components/AppSettings";
import { useTheme } from "@/lib/theme";
import type { Project } from "@/lib/types";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Avatar, btnGhost, btnPrimary, inputCls } from "@/components/Bits";

function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false); // closed until someone wants to change it
  const mismatch = again.length > 0 && next !== again;
  return (
    <section className="min-w-0 rounded-[28px] bg-white p-4 shadow-card sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <h3 className="text-lg font-semibold tracking-tight">Change password</h3>
        <ChevronDown className={clsx("h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <form className="anim-fade mt-3 grid gap-2.5" onSubmit={async (e) => {
        e.preventDefault(); if (mismatch) return;
        setState("saving"); setError("");
        try {
          const r = await api<{ token: string }>("/auth/password", { method: "POST", json: { currentPassword: cur, newPassword: next } });
          tokenStore.set(r.token); // this device stays signed in; other devices are signed out
          setCur(""); setNext(""); setAgain(""); setState("saved"); setTimeout(() => { setState("idle"); setOpen(false); }, 2500);
        } catch (err) { setError((err as Error).message); setState("idle"); }
      }}>
        <input className={inputCls} type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <input className={inputCls} type="password" placeholder="New password (min 8)" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        <input className={inputCls} type="password" placeholder="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnPrimary + " w-full"} disabled={state === "saving" || mismatch}>
            {state === "saved" ? <><Check className="h-4 w-4" />Password updated</> : state === "saving" ? "Updating…" : "Update password"}</button>
          {mismatch && <span className="text-sm text-rose-600">Passwords don’t match</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </form>}
    </section>
  );
}

export default function Profile() {
  const { user, updateName, logout } = useAuth();
  const { projects, project, setProjectId, setNewProject } = useWorkspace();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const theme = useTheme();
  if (!user) return null;
  const dirty = name.trim() !== user.name && name.trim().length > 0;

  const save = async () => {
    setState("saving"); setError("");
    try {
      await updateName(name.trim());
      qc.invalidateQueries({ queryKey: ["projects"] }); qc.invalidateQueries({ queryKey: ["tickets"] }); // names shown on cards / team
      setState("saved"); setTimeout(() => setState("idle"), 1800);
    } catch (e) { setError((e as Error).message); setState("idle"); }
  };

  return (
    // split view: profile + password on the left, projects on the right (only the projects list scrolls on wide screens)
    // phones: one column in the order profile, projects, appearance, password, developer access (the left wrapper dissolves so the cards can be re-ordered)
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5 lg:h-full lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6">
      <div className="min-w-0 space-y-5 max-lg:contents lg:overflow-y-auto lg:pr-1">
        <section className="min-w-0 rounded-[28px] bg-white p-4 shadow-card max-lg:order-1 sm:p-5">
          <div className="flex items-center gap-3.5">
            <Avatar user={user} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight">Your profile</h2>
              <p className="truncate text-sm text-slate-500" title={user.email}>{user.email}</p>
            </div>
            <button className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200" onClick={logout} title="Sign out"><LogOut className="h-3.5 w-3.5" />Sign out</button>
          </div>
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (dirty) save(); }}>
            <label className="block text-xs font-medium text-slate-500">Display name</label>
            <div className="mt-1 flex gap-2">
              <input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <button className={btnPrimary + " shrink-0 px-4"} disabled={!dirty || state === "saving"}>
                {state === "saved" ? <Check className="h-4 w-4" /> : state === "saving" ? "…" : "Save"}
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </section>

        <div className="min-w-0 max-lg:order-4"><AppSettings /></div>
        <div className="min-w-0 max-lg:order-5"><ChangePassword /></div>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] bg-white p-4 shadow-card max-lg:order-3 sm:p-5">
          <div><h3 className="font-semibold">Appearance</h3><p className="text-xs text-slate-500">Auto follows your device</p></div>
          <div className="flex gap-0.5 rounded-full bg-slate-200/70 p-1 text-xs font-medium">
            {(["auto", "light", "dark"] as const).map((c) => <button key={c} onClick={() => theme.set(c)} className={"rounded-full px-3 py-1.5 capitalize " + (theme.choice === c ? "bg-white text-slate-900 shadow-card" : "text-slate-600")}>{c}</button>)}
          </div>
        </section>

        <div className="max-lg:order-6">
        <button onClick={() => setDevOpen(true)} className="hidden w-full items-center gap-3 rounded-[28px] bg-white p-5 text-left shadow-card transition hover:shadow-lift sm:flex">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Bot className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">Developer access</span><span className="block text-xs text-slate-500">Let Claude Code work on your assigned tasks</span></span>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>
          {/* phones: shown but switched off (setting up developer access needs a computer) */}
          <div aria-disabled="true" className="flex w-full cursor-not-allowed items-center gap-3 rounded-[28px] bg-white p-4 opacity-55 shadow-card sm:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Bot className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">Developer access</span><span className="block text-xs text-slate-500">Available on desktop only</span></span>
          </div>
        </div>

      </div>

      <section className="flex min-h-0 min-w-0 flex-col rounded-[28px] bg-slate-200/50 p-3 max-lg:order-2 sm:p-4 lg:h-full">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2 px-1">
          <h3 className="min-w-0 text-lg font-semibold tracking-tight sm:text-xl">Your projects ({projects.length})</h3>
          <button className={btnGhost} onClick={() => setNewProject(true)}><FolderPlus className="h-4 w-4" />New project</button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {projects.length === 0 && <p className="rounded-[24px] bg-white p-6 text-sm text-slate-500 shadow-card">You’re not in any project yet. Create one, or ask a teammate to invite you.</p>}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="flex min-w-0 flex-col rounded-[24px] bg-white p-4 shadow-card sm:p-5 transition hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.key} · {p.members.length} member{p.members.length === 1 ? "" : "s"} · {p._count.tickets} ticket{p._count.tickets === 1 ? "" : "s"}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{p.myRole}</span>
                </div>
                {p.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="flex items-center gap-3">
                    {project?.id === p.id && <span className="text-xs font-medium text-emerald-600">● Currently open</span>}
                    {p.myRole === "ADMIN" && <button className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600" onClick={() => setToDelete(p)} title="Delete this project (admins only)"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
                  </span>
                  <button className="flex items-center gap-1 rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                    onClick={() => { setProjectId(p.id); router.push("/"); }}>Open board<ArrowRight className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {devOpen && <DeveloperAccess onClose={() => setDevOpen(false)} />}
      {toDelete && <DeleteProjectModal project={toDelete} onClose={() => setToDelete(null)} />}
    </div>
  );
}
