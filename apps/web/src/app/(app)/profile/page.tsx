"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FolderPlus, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Avatar, btnGhost, btnPrimary, inputCls } from "@/components/Bits";

function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const mismatch = again.length > 0 && next !== again;
  return (
    <section className="rounded-[28px] bg-white p-7 shadow-card">
      <h3 className="text-xl font-semibold tracking-tight">Change password</h3>
      <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault(); if (mismatch) return;
        setState("saving"); setError("");
        try {
          await api("/auth/password", { method: "POST", json: { currentPassword: cur, newPassword: next } });
          setCur(""); setNext(""); setAgain(""); setState("saved"); setTimeout(() => setState("idle"), 2500);
        } catch (err) { setError((err as Error).message); setState("idle"); }
      }}>
        <input className={inputCls} type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <input className={inputCls} type="password" placeholder="New password (min 8)" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        <input className={inputCls} type="password" placeholder="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        <div className="flex items-center gap-3 sm:col-span-3">
          <button className={btnPrimary} disabled={state === "saving" || mismatch}>
            {state === "saved" ? <><Check className="h-4 w-4" />Password updated</> : state === "saving" ? "Updating…" : "Update password"}</button>
          {mismatch && <span className="text-sm text-rose-600">Passwords don’t match</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </form>
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
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-[28px] bg-white p-7 shadow-card">
        <div className="flex items-center gap-5">
          <Avatar user={user} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-tight">Your profile</h2>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
          </div>
          <button className={btnGhost} onClick={logout}><LogOut className="h-4 w-4" />Sign out</button>
        </div>
        <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (dirty) save(); }}>
          <label className="min-w-60 flex-1 text-xs font-medium text-slate-500">Display name
            <input className={inputCls + " mt-1"} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className={btnPrimary} disabled={!dirty || state === "saving"}>
            {state === "saved" ? <><Check className="h-4 w-4" />Saved</> : state === "saving" ? "Saving…" : "Save changes"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </section>

      <ChangePassword />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold tracking-tight">Your projects ({projects.length})</h3>
          <button className={btnGhost} onClick={() => setNewProject(true)}><FolderPlus className="h-4 w-4" />New project</button>
        </div>
        {projects.length === 0 && <p className="rounded-[24px] bg-white p-6 text-sm text-slate-500 shadow-card">You’re not in any project yet. Create one, or ask a teammate to invite you.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="flex flex-col rounded-[24px] bg-white p-5 shadow-card transition hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.key} · {p.members.length} member{p.members.length === 1 ? "" : "s"} · {p._count.tickets} ticket{p._count.tickets === 1 ? "" : "s"}</div>
                </div>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{p.myRole}</span>
              </div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.description}</p>}
              <div className="mt-4 flex items-center justify-between">
                {project?.id === p.id ? <span className="text-xs font-medium text-emerald-600">● Currently open</span> : <span />}
                <button className="flex items-center gap-1 rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                  onClick={() => { setProjectId(p.id); router.push("/"); }}>Open board<ArrowRight className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
