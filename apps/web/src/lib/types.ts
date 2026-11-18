import type { Priority, Role, Status, TicketType } from "@bitcode/shared";

export type User = { id: string; name: string; email: string; title: string | null; active: boolean; role?: Role; emailVerified?: boolean }; // role = role inside the current project
export type Project = { id: string; name: string; key: string; description: string | null; repoUrl?: string | null; repoBranch?: string | null; members: User[]; myRole: Role; _count: { tickets: number } };
export type Ticket = {
  id: string; key: string; number: number; title: string; description: string | null;
  type: TicketType; priority: Priority; status: Status; position: number; labels: string[];
  dueDate: string | null; assignees: User[]; reporter: User; project: { id: string; key: string; name: string; repoUrl?: string | null; repoBranch?: string | null };
  createdAt: string; updatedAt: string; _count: { comments: number }; subtasks: { done: boolean }[];
};
export type Comment = { id: string; body: string; createdAt: string; author: User; parentId: string | null; viaAgent?: string | null };
export type AppNotification = { id: string; kind: string; text: string; actorId: string | null; actorName: string | null; projectId: string | null; ticketId: string | null; createdAt: string; readAt: string | null };
export type Activity = { id: string; message: string; createdAt: string; actor: User; viaAgent?: string | null };
export type ApiTokenRow = { id: string; name: string; prefix: string; canCommentOthers: boolean; level: "tasks" | "collaborator" | "full"; expiresAt: string | null; lastUsedAt: string | null; createdAt: string };
export type SubtaskRow = { id: string; title: string; done: boolean; position: number };
export type TicketRepoRow = { id: string; url: string; branch: string | null; createdAt: string; addedBy: { id: string; name: string } };
export type TicketDetail = Omit<Ticket, "subtasks"> & { comments: Comment[]; activities: Activity[]; subtasks: SubtaskRow[]; repos: TicketRepoRow[] };
