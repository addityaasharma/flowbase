import { z } from "zod";

export const ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;
export const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const TYPES = ["TASK", "BUG", "FEATURE", "IMPROVEMENT"] as const;

export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TicketType = (typeof TYPES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  TODO: "To Do", IN_PROGRESS: "In Progress", IN_REVIEW: "In Review / QA", BLOCKED: "Blocked", DONE: "Done",
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical",
};

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const githubUrl = z.string().trim().max(200).regex(/^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?(\.git)?\/?$/, "Use a GitHub repository URL like https://github.com/owner/repo");
const branchName = z.string().trim().max(60).regex(/^[A-Za-z0-9._\/-]+$/, "Branch names can use letters, numbers and . _ - /");
/** A GitHub repo someone attaches to a task (their fork, a different repo, ...). */
export const ticketRepoSchema = z.object({ url: githubUrl, branch: z.preprocess(emptyToNull, branchName.nullable().optional()) });
export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(), description: z.string().trim().max(500).nullable().optional(),
  repoUrl: z.preprocess(emptyToNull, z.string().trim().max(200).regex(/^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?(\.git)?\/?$/, "Use a GitHub repository URL like https://github.com/owner/repo").nullable().optional()),
  repoBranch: z.preprocess(emptyToNull, z.string().trim().max(60).regex(/^[A-Za-z0-9._\/-]+$/, "Branch names can use letters, numbers and . _ - /").nullable().optional()),
});
export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60), expiresInDays: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)]).default(90), canCommentOthers: z.boolean().default(true),
});
export const forgotSchema = z.object({ email: z.string().email().max(200) });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) });
export const verifySchema = z.object({ token: z.string().min(10).max(200) });
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80), email: z.string().email().max(200), password: z.string().min(8).max(200),
});
export const inviteSchema = z.object({
  email: z.string().email().max(200), projectId: z.string(), role: z.enum(ROLES).default("MEMBER"),
});
export const acceptInviteSchema = z.object({ token: z.string().min(10), name: z.string().trim().min(1).max(80).optional(), password: z.string().min(6).max(200) });
export const memberRoleSchema = z.object({ role: z.enum(ROLES) });
export const createProjectSchema = z.object({
  name: z.string().min(1), key: z.string().regex(/^[A-Z]{2,6}$/, "2-6 uppercase letters"),
  description: z.string().max(500).optional(),
});
export const createTicketSchema = z.object({
  projectId: z.string(), title: z.string().min(1).max(200), description: z.string().max(20000).optional(),
  type: z.enum(TYPES).default("TASK"), priority: z.enum(PRIORITIES).default("MEDIUM"),
  status: z.enum(STATUSES).default("TODO"), assigneeIds: z.array(z.string()).max(20).default([]),
  labels: z.array(z.string()).default([]), dueDate: z.string().nullable().optional(),
});
export const updateTicketSchema = createTicketSchema.omit({ projectId: true }).partial();
export const moveTicketSchema = z.object({
  status: z.enum(STATUSES), beforeId: z.string().nullable().optional(), afterId: z.string().nullable().optional(),
});
export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000), parentId: z.string().optional() });
