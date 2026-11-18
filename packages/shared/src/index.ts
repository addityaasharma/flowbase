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
  projectId: z.string(), title: z.string().min(1), description: z.string().optional(),
  type: z.enum(TYPES).default("TASK"), priority: z.enum(PRIORITIES).default("MEDIUM"),
  status: z.enum(STATUSES).default("TODO"), assigneeIds: z.array(z.string()).max(20).default([]),
  labels: z.array(z.string()).default([]), dueDate: z.string().nullable().optional(),
});
export const updateTicketSchema = createTicketSchema.omit({ projectId: true }).partial();
export const moveTicketSchema = z.object({
  status: z.enum(STATUSES), beforeId: z.string().nullable().optional(), afterId: z.string().nullable().optional(),
});
export const commentSchema = z.object({ body: z.string().min(1) });
