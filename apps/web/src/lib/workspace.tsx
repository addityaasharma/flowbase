"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@bitcode/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Project, Ticket, User } from "./types";
import type { Priority } from "@bitcode/shared";
import { assignTones, toneByHash, type Tone } from "./tones";

export type Filters = { q: string; priorities: Priority[]; label: string; due: "" | "overdue" | "week" | "none"; mine: boolean };
export const NO_FILTERS: Filters = { q: "", priorities: [], label: "", due: "", mine: false };
export const filtersActive = (f: Filters) => !!(f.q || f.priorities.length || f.label || f.due || f.mine);

type Ctx = {
  filters: Filters; setFilters: (f: Filters) => void; allLabels: string[]; totalCount: number;
  projects: Project[]; projectsLoaded: boolean; project: Project | undefined; setProjectId: (id: string) => void;
  toneOf: (userId: string) => Tone; // colour of a person, unique within the open project
  members: User[]; myRole: Role | null; canManage: boolean; // canManage = admin or manager of the current project
  assignee: string; setAssignee: (id: string) => void;
  tickets: Ticket[]; refetchTickets: () => void; openTicket: (id: string | null) => void; openId: string | null;
  /** Open any ticket you can access (switching project if needed). Resolves false if it no longer exists. */
  goToTicket: (id: string) => Promise<boolean>;
  raise: boolean; setRaise: (v: boolean) => void;
  newProject: boolean; setNewProject: (v: boolean) => void;
};
const C = createContext<Ctx>(null!);

// the project you are in survives a page refresh (browser-local; falls back to your first project if it is gone)
const PROJECT_KEY = "flowbase:project";
const LINK_KEY = "flowbase:openTicket"; // a ?ticket=<id> link from an email, kept until the user is signed in
const readSavedProject = () => { try { return localStorage.getItem(PROJECT_KEY) ?? ""; } catch { return ""; } };
export const useWorkspace = () => useContext(C);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projectId, setProjectId] = useState(readSavedProject);
  const [assignee, setAssignee] = useState("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [openId, openTicket] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [newProject, setNewProject] = useState(false);

  // queries are per signed-in user: a different account must never see cached data from the previous one
  const goToTicket = useCallback(async (id: string) => {
    try { const t = await api<Ticket>(`/tickets/${id}`); setProjectId(t.project.id); openTicket(id); return true; }
    catch { return false; } // no access or deleted: stay where we are
  }, []);

  // Deep link from an email ("Open task"): remember the ticket, clean the URL, then open it once we know who the user is.
  useEffect(() => {
    try {
      const id = new URLSearchParams(location.search).get("ticket");
      if (id) { sessionStorage.setItem(LINK_KEY, id); history.replaceState(null, "", location.pathname); }
    } catch { /* storage blocked: the link just opens the board */ }
  }, []);
  useEffect(() => {
    if (!user) return;
    let id: string | null = null;
    try { id = sessionStorage.getItem(LINK_KEY); sessionStorage.removeItem(LINK_KEY); } catch { /* ignore */ }
    if (!id) return;
    goToTicket(id);
  }, [user, goToTicket]);

  const projects = useQuery({ queryKey: ["projects", user?.id], enabled: !!user, queryFn: () => api<Project[]>("/projects") });
  const project = projects.data?.find((p) => p.id === projectId) ?? projects.data?.[0];
  useEffect(() => { if (project && project.id !== projectId) setProjectId(project.id); }, [project, projectId]);
  useEffect(() => { if (project) { try { localStorage.setItem(PROJECT_KEY, project.id); } catch { /* storage blocked: just not remembered */ } } }, [project]);

  const tickets = useQuery({
    queryKey: ["tickets", project?.id], enabled: !!project, refetchInterval: 30000, // safety net; real-time updates arrive over the event stream
    queryFn: () => api<Ticket[]>(`/tickets?projectId=${project!.id}`),
  });
  const list = project ? tickets.data ?? [] : [];
  const today = new Date().toISOString().slice(0, 10), weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const q = filters.q.trim().toLowerCase();
  const filtered = list.filter((t) => {
    if (!(assignee === "all" ? true : assignee === "unassigned" ? t.assignees.length === 0 : t.assignees.some((a) => a.id === assignee))) return false;
    if (q && !`${t.key} ${t.title} ${t.description ?? ""} ${t.labels.join(" ")}`.toLowerCase().includes(q)) return false;
    if (filters.priorities.length && !filters.priorities.includes(t.priority)) return false;
    if (filters.label && !t.labels.includes(filters.label)) return false;
    if (filters.mine && !t.assignees.some((a) => a.id === user?.id)) return false;
    const due = t.dueDate?.slice(0, 10);
    if (filters.due === "none" && due) return false;
    if (filters.due === "overdue" && !(due && due < today && t.status !== "DONE")) return false;
    if (filters.due === "week" && !(due && due >= today && due <= weekEnd && t.status !== "DONE")) return false;
    return true;
  });
  const allLabels = [...new Set(list.flatMap((t) => t.labels))].sort();
  const myRole = project?.myRole ?? null;
  const tones = useMemo(() => assignTones((project?.members ?? []).map((m) => m.id)), [project]);
  const toneOf = (id: string) => tones.get(id) ?? toneByHash(id);

  return (
    <C.Provider value={{
      projects: projects.data ?? [], projectsLoaded: projects.isSuccess, project, setProjectId: (id) => { setProjectId(id); setAssignee("all"); setFilters(NO_FILTERS); },
      toneOf, members: project?.members ?? [], myRole, canManage: myRole === "ADMIN" || myRole === "MANAGER",
      assignee, setAssignee, tickets: filtered, refetchTickets: () => tickets.refetch(), openTicket, openId,
      filters, setFilters, allLabels, totalCount: list.length,
      goToTicket, raise, setRaise, newProject, setNewProject,
    }}>{children}</C.Provider>
  );
}
