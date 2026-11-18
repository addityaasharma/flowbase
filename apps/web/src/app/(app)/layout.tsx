"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutGrid, ListChecks, FolderPlus, LogIn, LogOut, Plus, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Avatar, btnPrimary } from "@/components/Bits";
import { TicketDrawer } from "@/components/TicketDrawer";
import { RaiseTicket } from "@/components/RaiseTicket";
import { NewProject } from "@/components/NewProject";
import { SignInPopover } from "@/components/SignInPopover";
import { STATUSES } from "@bitcode/shared";

const TABS = [
  { href: "/", label: "Board", icon: LayoutGrid },
  { href: "/tickets", label: "All Tickets", icon: ListChecks },
  { href: "/team", label: "Team & Roles", icon: Users },
];

function Welcome() {
  const { user, requireAuth, setSignInOpen } = useAuth();
  const w = useWorkspace();
  return (
    <div className="anim-pop mx-auto mt-10 max-w-xl rounded-[32px] bg-white p-10 text-center shadow-card">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-b from-indigo-400 to-indigo-600 text-white shadow-card"><Sparkles className="h-6 w-6" /></span>
      <h2 className="text-3xl font-semibold tracking-tight">{user ? "Create your first project" : "Plan and track your team’s work"}</h2>
      <p className="mx-auto mt-3 max-w-md text-slate-500">
        {user ? "A project is a workspace for your team’s tickets. You’ll be its admin and can invite teammates by email."
          : "Create a free workspace, invite your team by email and move work across the board. Everything stays private to the people you invite."}
      </p>
      <div className="mt-7 flex justify-center gap-3">
        {user
          ? <button className={btnPrimary} onClick={() => w.setNewProject(true)}><FolderPlus className="h-4 w-4" />Create project</button>
          : <><button className={btnPrimary} onClick={() => requireAuth(() => w.setNewProject(true))}><FolderPlus className="h-4 w-4" />Create a project</button>
              <button className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-2 text-sm font-medium hover:bg-slate-200" onClick={() => setSignInOpen(true)}><LogIn className="h-4 w-4" />Sign in</button></>}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, requireAuth, setSignInOpen } = useAuth();
  const path = usePathname();
  const w = useWorkspace();
  const count = (s: string[]) => w.tickets.filter((t) => s.includes(t.status)).length;
  const stats = [
    ["Open / Blocked", count(["TODO", "BLOCKED"]), "text-slate-500"],
    ["In Progress", count(["IN_PROGRESS"]), "text-indigo-600"],
    ["QA / Review", count(["IN_REVIEW"]), "text-amber-600"],
    ["Done", count(["DONE"]), "text-emerald-600"],
  ] as const;
  void STATUSES;
  const hasProject = !!user && !!w.project;
  const empty = !loading && (!user || (w.projectsLoaded && !w.project)); // guest, or signed in with no project yet

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="glass z-40 shrink-0 border-b border-black/5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-b from-indigo-400 to-indigo-600 text-white shadow-card"><Sparkles className="h-5 w-5" /></span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[22px] font-semibold tracking-tight">Bitcode Tracker</h1>
                {hasProject && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">● Live Sync</span>}
              </div>
              {hasProject ? <select className="-ml-1 bg-transparent text-sm text-slate-500 outline-none" value={w.project?.id ?? ""} onChange={(e) => w.setProjectId(e.target.value)}>
                {w.projects.map((p) => <option key={p.id} value={p.id}>{p.name} • {p.members.length} Members</option>)}
              </select> : <p className="text-sm text-slate-500">Work tracking for teams</p>}
            </div>
          </div>
          {hasProject && <nav className="flex gap-0.5 rounded-full bg-slate-200/70 p-1">
            {TABS.map(({ href, label, icon: I }) => (
              <Link key={href} href={href} className={clsx("flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition",
                path === href ? "bg-white text-slate-900 shadow-card" : "text-slate-600 hover:text-slate-900")}>
                <I className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>}
          <div className="flex items-center gap-3">
            {hasProject && <>
            <select className="rounded-full bg-slate-200/70 px-4 py-2 text-sm font-medium outline-none hover:bg-slate-200" value={w.assignee} onChange={(e) => w.setAssignee(e.target.value)}>
              <option value="all">Everyone ({w.project?.members.length ?? 0})</option>
              <option value="unassigned">Unassigned</option>
              {w.project?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className={btnPrimary + " py-2.5 shadow-card"} onClick={() => requireAuth(() => w.setRaise(true))}><Plus className="h-4 w-4" />Raise Ticket</button></>}
            <button className="inline-flex items-center gap-2 rounded-full bg-slate-200/70 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-200"
              onClick={() => requireAuth(() => w.setNewProject(true))}><FolderPlus className="h-4 w-4" />New Project</button>
            {user ? (
              <div className="flex items-center gap-2"><Avatar user={user} size={36} />
                <button onClick={logout} title="Sign out" className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><LogOut className="h-4 w-4" /></button>
              </div>
            ) : (
              <button onClick={() => setSignInOpen(true)} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"><LogIn className="h-4 w-4" />Sign in</button>
            )}
          </div>
        </div>
        {hasProject && <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-3 px-6 pb-4 md:grid-cols-4">
          {stats.map(([label, n, cls]) => (
            <div key={label} className={clsx("flex items-baseline justify-between rounded-2xl bg-white px-5 py-3 shadow-card", cls)}>
              <span className="text-[13px] font-medium">{label}</span><span className="text-3xl font-semibold tracking-tight text-slate-900">{n}</span>
            </div>
          ))}
        </div>}
      </header>
      <main className="min-h-0 w-full flex-1 overflow-y-auto"><div className="mx-auto h-full max-w-[1600px] px-6 pb-6 pt-5">{loading ? null : empty ? <Welcome /> : children}</div></main>
      <SignInPopover />
      {w.newProject && <NewProject onClose={() => w.setNewProject(false)} />}
      {w.raise && <RaiseTicket onClose={() => w.setRaise(false)} />}
      {w.openId && <TicketDrawer id={w.openId} onClose={() => w.openTicket(null)} />}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><Shell>{children}</Shell></WorkspaceProvider>;
}
