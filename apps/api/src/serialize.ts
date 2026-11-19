import type { Role } from "@bitcode/shared";

export const userSelect = { id: true, name: true, email: true, title: true, active: true, avatar: true } as const;

export const ticketInclude = {
  assignees: { select: { userId: true, user: { select: userSelect } }, orderBy: { assignedAt: "asc" as const } },
  reporter: { select: userSelect },
  project: { select: { id: true, key: true, name: true, repoUrl: true, repoBranch: true } },
  _count: { select: { comments: true } },
  subtasks: { select: { done: true } }, // for the "2/5" progress chip on cards
} as const;

type RawAssignee = { userId: string; user: { id: string; name: string; email: string; title: string | null; active: boolean } };
/** Adds the display key (BIT-3) and flattens the assignee join rows into a plain user list. */
export function withKey<T extends { number: number; project: { key: string }; assignees: RawAssignee[] }>(t: T) {
  return { ...t, key: `${t.project.key}-${t.number}`, assignees: t.assignees.map((a) => a.user) };
}

type Member = { role: Role; user: { id: string; name: string; email: string; title: string | null; active: boolean } };
/** Members as users decorated with their role inside the project. */
export const flattenMembers = (members: Member[]) => members.map((m) => ({ ...m.user, role: m.role }));
