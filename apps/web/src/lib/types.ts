import type { Priority, Role, Status, TicketType } from "@bitcode/shared";

export type User = { id: string; name: string; email: string; title: string | null; active: boolean; role?: Role }; // role = role inside the current project
export type Project = { id: string; name: string; key: string; description: string | null; members: User[]; myRole: Role; _count: { tickets: number } };
export type Ticket = {
  id: string; key: string; number: number; title: string; description: string | null;
  type: TicketType; priority: Priority; status: Status; position: number; labels: string[];
  dueDate: string | null; assignee: User | null; reporter: User; project: { id: string; key: string; name: string };
  createdAt: string; updatedAt: string; _count: { comments: number };
};
export type Comment = { id: string; body: string; createdAt: string; author: User };
export type Activity = { id: string; message: string; createdAt: string; actor: User };
export type TicketDetail = Ticket & { comments: Comment[]; activities: Activity[] };
