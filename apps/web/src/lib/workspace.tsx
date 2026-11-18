"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@bitcode/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Project, Ticket, User } from "./types";

type Ctx = {
  projects: Project[]; projectsLoaded: boolean; project: Project | undefined; setProjectId: (id: string) => void;
  members: User[]; myRole: Role | null; canManage: boolean; // canManage = admin or manager of the current project
  assignee: string; setAssignee: (id: string) => void;
  tickets: Ticket[]; refetchTickets: () => void; openTicket: (id: string | null) => void; openId: string | null;
  raise: boolean; setRaise: (v: boolean) => void;
  newProject: boolean; setNewProject: (v: boolean) => void;
};
const C = createContext<Ctx>(null!);
export const useWorkspace = () => useContext(C);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projectId, setProjectId] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [openId, openTicket] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [newProject, setNewProject] = useState(false);

  // queries are per signed-in user: a different account must never see cached data from the previous one
  const projects = useQuery({ queryKey: ["projects", user?.id], enabled: !!user, queryFn: () => api<Project[]>("/projects") });
  const project = projects.data?.find((p) => p.id === projectId) ?? projects.data?.[0];
  useEffect(() => { if (project && project.id !== projectId) setProjectId(project.id); }, [project, projectId]);

  const tickets = useQuery({
    queryKey: ["tickets", project?.id], enabled: !!project, refetchInterval: 5000, // "live sync"
    queryFn: () => api<Ticket[]>(`/tickets?projectId=${project!.id}`),
  });
  const list = project ? tickets.data ?? [] : [];
  const filtered = list.filter((t) => assignee === "all" ? true : assignee === "unassigned" ? !t.assignee : t.assignee?.id === assignee);
  const myRole = project?.myRole ?? null;

  return (
    <C.Provider value={{
      projects: projects.data ?? [], projectsLoaded: projects.isSuccess, project, setProjectId: (id) => { setProjectId(id); setAssignee("all"); },
      members: project?.members ?? [], myRole, canManage: myRole === "ADMIN" || myRole === "MANAGER",
      assignee, setAssignee, tickets: filtered, refetchTickets: () => tickets.refetch(), openTicket, openId,
      raise, setRaise, newProject, setNewProject,
    }}>{children}</C.Provider>
  );
}
