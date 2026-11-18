import type { Priority, Status, TicketType } from "@bitcode/shared";

export const STATUS_DOT: Record<Status, string> = {
  TODO: "bg-slate-500", IN_PROGRESS: "bg-indigo-500", IN_REVIEW: "bg-amber-500", BLOCKED: "bg-rose-500", DONE: "bg-emerald-500",
};
export const STATUS_PILL: Record<Status, string> = {
  TODO: "bg-slate-100 text-slate-700", IN_PROGRESS: "bg-indigo-50 text-indigo-700",
  IN_REVIEW: "bg-amber-50 text-amber-700", BLOCKED: "bg-rose-50 text-rose-700", DONE: "bg-emerald-50 text-emerald-700",
};
export const PRIORITY_PILL: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600", MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700", CRITICAL: "bg-rose-50 text-rose-600",
};
export const TYPE_LABEL: Record<TicketType, string> = { TASK: "Task", BUG: "Bug", FEATURE: "Feature", IMPROVEMENT: "Improvement" };
export const NEXT_ACTION: Partial<Record<Status, { label: string; to: Status }>> = {
  TODO: { label: "Start Work", to: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Send to QA", to: "IN_REVIEW" },
  IN_REVIEW: { label: "Mark Done", to: "DONE" },
  BLOCKED: { label: "Unblock", to: "IN_PROGRESS" },
};
