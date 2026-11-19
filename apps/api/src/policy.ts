import type { AccessLevel } from "./tokens";

/**
 * What a token may call on the normal API (paths relative to /api). The route handlers then apply the owner's own rights,
 * exactly as for a person: a token can never do more than the signed-in user could.
 *  - "tasks": nothing here (those tokens only use /api/agent and /api/mcp)
 *  - "collaborator": read everything the user can, comment, raise/edit/assign/move tickets, subtasks, repos, images
 *  - "full": + delete tickets, projects, invitations, members and roles
 * No token, at any level, can touch account security (password, tokens, email verification, sessions) or the live stream.
 */
const ID = "[^/]+";
const re = (s: string) => new RegExp(`^${s}$`);
const COLLAB: Array<[string, RegExp]> = [
  ["GET", re("/auth/me")], ["GET", re("/projects")], ["GET", re("/tickets")], ["GET", re(`/tickets/${ID}`)], ["GET", re("/notifications")],
  ["POST", re("/tickets")], ["PATCH", re(`/tickets/${ID}`)], ["POST", re(`/tickets/${ID}/move`)], ["POST", re(`/tickets/${ID}/comments`)],
  ["POST", re(`/tickets/${ID}/subtasks`)], ["PATCH", re(`/subtasks/${ID}`)], ["POST", re(`/subtasks/${ID}/remind`)], ["DELETE", re(`/subtasks/${ID}`)],
  ["POST", re(`/tickets/${ID}/repos`)], ["DELETE", re(`/ticket-repos/${ID}`)],
  ["POST", re("/uploads")], ["POST", re("/notifications/read-all")], ["POST", re(`/notifications/${ID}/read`)],
];
const FULL: Array<[string, RegExp]> = [
  ["DELETE", re(`/tickets/${ID}`)],
  ["POST", re("/projects")], ["PATCH", re(`/projects/${ID}`)], ["DELETE", re(`/projects/${ID}`)],
  ["PATCH", re(`/projects/${ID}/members/${ID}`)], ["DELETE", re(`/projects/${ID}/members/${ID}`)], ["PUT", re(`/projects/${ID}/members`)],
  ["GET", re("/invitations")], ["POST", re("/invitations")], ["POST", re(`/invitations/${ID}/resend`)], ["DELETE", re(`/invitations/${ID}`)],
];
const NEVER = /^\/(auth(\/|$)|tokens(\/|$)|events$)/; // /auth/me (read) is whitelisted above, but only after this check

export function tokenMayCall(level: AccessLevel, method: string, rawPath: string): boolean {
  if (level === "tasks") return false;
  const path = rawPath.replace(/\/+$/, "") || "/", m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  if (NEVER.test(path) && !(m === "GET" && path === "/auth/me")) return false;
  const rules = level === "full" ? [...COLLAB, ...FULL] : COLLAB;
  return rules.some(([mm, r]) => mm === m && r.test(path));
}
