"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, Keyboard, LayoutGrid, Moon, Sun, ListChecks, FolderPlus, LogIn, LogOut, Plus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Avatar, btnPrimary } from "@/components/Bits";
import { TicketDrawer } from "@/components/TicketDrawer";
import { RaiseTicket } from "@/components/RaiseTicket";
import { NewProject } from "@/components/NewProject";
import { SignInPopover } from "@/components/SignInPopover";
import { Toasts } from "@/components/Toasts";
import { FlowbaseMark } from "@/components/Logo";
import { WelcomeTour } from "@/components/WelcomeTour";
import { NotificationBell } from "@/components/NotificationBell";
import { OnlinePill } from "@/components/OnlinePill";
import { VerifyBanner } from "@/components/VerifyBanner";
import { FilterBar } from "@/components/FilterBar";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { useTheme } from "@/lib/theme";
import { RealtimeProvider, useRealtime } from "@/lib/realtime";
import { STATUSES } from "@bitcode/shared";

const TABS = [
  { href: "/", label: "Board", short: "Board", icon: LayoutGrid },
  { href: "/tickets", label: "All Tickets", short: "Tickets", icon: ListChecks },
  { href: "/team", label: "Team & Roles", short: "Teams", icon: Users },
];

function Welcome() {
  const { user, requireAuth, setSignInOpen } = useAuth();
  const w = useWorkspace();
  return (
    <div className="anim-pop mx-auto mt-10 max-w-xl rounded-[32px] bg-white p-10 text-center shadow-card">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-100 text-slate-800 shadow-card"><FlowbaseMark className="h-7 w-auto" /></span>
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
  const rt = useRealtime();
  const count = (s: string[]) => w.tickets.filter((t) => s.includes(t.status)).length;
  const stats = [
    ["Open / Blocked", count(["TODO", "BLOCKED"]), "text-slate-500"],
    ["In Progress", count(["IN_PROGRESS"]), "text-indigo-600"],
    ["QA / Review", count(["IN_REVIEW"]), "text-amber-600"],
    ["Done", count(["DONE"]), "text-emerald-600"],
  ] as const;
  void STATUSES;
  const hasProject = !!user && !!w.project;
  const router = useRouter();
  const [help, setHelp] = useState(false);
  // The summary tiles can be folded away to give the board more room; the choice is remembered in this browser.
  const [statsOpen, setStatsOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem("flowbase:summary") === "closed") setStatsOpen(false); } catch { /* default: open */ } }, []);
  const toggleStats = () => setStatsOpen((v) => { try { localStorage.setItem("flowbase:summary", v ? "closed" : "open"); } catch { /* not remembered */ } return !v; });
  const theme = useTheme();

  // Keyboard shortcuts (ignored while typing in a field, or with Ctrl/Cmd/Alt held)
  useEffect(() => {
    let g = 0; // time of the last "g", for the "g then b/t/m/p" navigation sequences
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || el?.closest("input, textarea, select, [contenteditable=true]")) return;
      const k = e.key;
      if (k === "?") { e.preventDefault(); setHelp((v) => !v); return; }
      if (!user) return;
      if (k === "g") { g = Date.now(); return; }
      if (Date.now() - g < 1200 && "btmp".includes(k) && k.length === 1) { g = 0; router.push({ b: "/", t: "/tickets", m: "/team", p: "/profile" }[k]!); return; }
      if (k === "/" && hasProject && (path === "/" || path === "/tickets")) { e.preventDefault(); window.dispatchEvent(new Event("flowbase:search")); return; }
      if (k === "c" && hasProject && !w.openId && !w.raise) { e.preventDefault(); w.setRaise(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, hasProject, path, router, w]);
  const onlineCount = w.members.filter((m) => rt.isOnline(m.id)).length; // shown on the Teams tab on phones
  const empty = !loading && (!user || (w.projectsLoaded && !w.project)); // guest, or signed in with no project yet

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <VerifyBanner />
      <header className="glass z-40 shrink-0 border-b border-black/5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3 sm:px-6">
          <div className="flex w-full items-center gap-2.5 sm:w-auto">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-800 shadow-card ring-1 ring-black/5"><FlowbaseMark className="h-[18px] w-auto" /></span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold leading-tight tracking-tight">Flowbase</h1>
                {hasProject && (rt.connected
                  ? <span className="rounded-full bg-emerald-50 px-2 py-px text-[10px] font-medium text-emerald-700" title="Updates appear instantly">● Live</span>
                  : <span className="rounded-full bg-amber-50 px-2 py-px text-[10px] font-medium text-amber-700" title="Reconnecting…">● Reconnecting…</span>)}
              </div>
              {hasProject ? <select className="max-sm:hidden -ml-1 bg-transparent text-xs leading-tight text-slate-600 outline-none" value={w.project?.id ?? ""} onChange={(e) => w.setProjectId(e.target.value)}>
                {w.projects.map((p) => <option key={p.id} value={p.id}>{p.name} • {p.members.length} Members</option>)}
              </select> : <p className="text-xs text-slate-500">Work tracking for teams</p>}
            </div>
            {user && <Link href="/profile" title="Your profile" aria-label="Your profile" className={clsx("ml-auto shrink-0 rounded-full sm:hidden", path === "/profile" && "ring-2 ring-indigo-400")}><Avatar user={user} size={36} /></Link>}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
          {hasProject && <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-full bg-slate-200/70 p-1 sm:w-auto sm:flex-none">
            {TABS.map(({ href, label, short, icon: I }) => (
              <Link key={href} href={href} className={clsx("flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition sm:flex-none sm:px-4",
                path === href ? "bg-white text-slate-900 shadow-card" : "text-slate-600 hover:text-slate-900")}>
                <I className="h-4 w-4" /><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
                {href === "/team" && rt.connected && onlineCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-px text-[11px] font-semibold text-emerald-700 sm:hidden" title={`${onlineCount} online now`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{onlineCount}</span>
                )}
              </Link>
            ))}
          </nav>}
          <div className="shrink-0 sm:hidden"><NotificationBell /></div>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:flex-wrap sm:gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:flex-wrap sm:gap-3">
            {hasProject && <>
            <select className="max-sm:hidden max-w-[6.4rem] truncate rounded-full bg-slate-200/70 px-3 py-2 text-sm font-medium outline-none hover:bg-slate-200 sm:max-w-none sm:px-4" value={w.assignee} onChange={(e) => w.setAssignee(e.target.value)}>
              <option value="all">Everyone ({w.project?.members.length ?? 0})</option>
              <option value="unassigned">Unassigned</option>
              {w.project?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className={btnPrimary + " max-sm:hidden shrink-0 !px-3.5 py-2.5 shadow-card sm:!px-5"} onClick={() => requireAuth(() => w.setRaise(true))}><Plus className="h-4 w-4" /><span className="sm:hidden max-[380px]:hidden">Raise</span><span className="hidden sm:inline">Raise Ticket</span></button></>}
            <button aria-label="New project" className="hidden shrink-0 items-center gap-2 rounded-full sm:inline-flex bg-slate-200/70 px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-200 sm:px-4"
              onClick={() => requireAuth(() => w.setNewProject(true))}><FolderPlus className="h-4 w-4" />New Project</button>
            </div>
            <div className="flex items-center gap-2">
            <button onClick={theme.toggle} title={theme.dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle dark mode" className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 md:flex">{theme.dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}</button>
            <button onClick={() => setHelp(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 md:flex"><Keyboard className="h-[18px] w-[18px]" /></button>
            {hasProject && <div className="hidden sm:block"><OnlinePill /></div>}
            <div className="hidden sm:block"><NotificationBell /></div>
            {user ? (
              <div className="hidden items-center gap-1.5 sm:flex">
                <Link href="/profile" title="Your profile" className={clsx("flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition", path === "/profile" ? "bg-white shadow-card" : "hover:bg-slate-200/70")}>
                  <Avatar user={user} size={32} /><span className="hidden max-w-24 truncate sm:inline">{user.name.split(" ")[0]}</span>
                </Link>
                <button onClick={logout} title="Sign out" aria-label="Sign out" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 sm:h-9 sm:w-9"><LogOut className="h-4 w-4" /></button>
              </div>
            ) : (
              <button onClick={() => setSignInOpen(true)} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"><LogIn className="h-4 w-4" />Sign in</button>
            )}
            </div>
          </div>
        </div>
        {hasProject && path !== "/profile" && (
          <div className="hidden md:block">
            <div className="mx-auto max-w-[1600px] px-6 pb-1.5">
              <button type="button" onClick={toggleStats} aria-expanded={statsOpen} className="group flex items-center gap-1.5 rounded-full py-0.5 pr-2 text-xs font-medium text-slate-500 hover:text-slate-900">
                <ChevronDown className={clsx("h-4 w-4 transition-transform duration-300", !statsOpen && "-rotate-90")} />Summary
                {!statsOpen && <span className="ml-1 font-normal text-slate-400">{stats.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(" · ")}</span>}
              </button>
            </div>
            <div className={clsx("grid transition-[grid-template-rows] duration-300 ease-out", statsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="min-h-0 overflow-hidden">
                <div className="mx-auto grid max-w-[1600px] grid-cols-4 gap-3 px-6 pb-4">
                  {stats.map(([label, n, cls]) => (
                    <div key={label} className={clsx("flex items-baseline justify-between rounded-2xl bg-white px-5 py-3 shadow-card", cls)}>
                      <span className="text-[13px] font-medium">{label}</span><span className="text-3xl font-semibold tracking-tight text-slate-900">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
      {hasProject && (path === "/" || path === "/tickets") && <FilterBar />}
      {hasProject && !w.openId && !w.raise && (
        <button type="button" aria-label="Raise ticket" onClick={() => requireAuth(() => w.setRaise(true))}
          className="fixed bottom-5 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lift transition active:scale-95 sm:hidden"><Plus className="h-6 w-6" /></button>
      )}
      <main className="min-h-0 w-full flex-1 overflow-y-auto"><div className="mx-auto h-full max-w-[1600px] px-4 pb-6 pt-4 sm:px-6 sm:pt-5">{loading ? null : empty && !(user && path === "/profile") ? <Welcome /> : children}</div></main>
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      <SignInPopover />
      <WelcomeTour />
      <Toasts />
      {w.newProject && <NewProject onClose={() => w.setNewProject(false)} />}
      {w.raise && <RaiseTicket onClose={() => w.setRaise(false)} />}
      {w.openId && <TicketDrawer id={w.openId} onClose={() => w.openTicket(null)} />}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><RealtimeProvider><Shell>{children}</Shell></RealtimeProvider></WorkspaceProvider>;
}
