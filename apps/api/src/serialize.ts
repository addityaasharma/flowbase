import type { Role } from "@bitcode/shared";

export const userSelect = { id: true, name: true, email: true, title: true, active: true } as const;

export const ticketInclude = {
  assignee: { select: userSelect },
  reporter: { select: userSelect },
  project: { select: { id: true, key: true, name: true } },
  _count: { select: { comments: true } },
} as const;

export function withKey<T extends { number: number; project: { key: string } }>(t: T) {
  return { ...t, key: `${t.project.key}-${t.number}` };
}

type Member = { role: Role; user: { id: string; name: string; email: string; title: string | null; active: boolean } };
/** Members as users decorated with their role inside the project. */
export const flattenMembers = (members: Member[]) => members.map((m) => ({ ...m.user, role: m.role }));
