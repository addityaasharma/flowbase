import type { Request, Response } from "express";
import { prisma } from "./db";

/**
 * In-memory realtime hub (Server-Sent Events). One API process => no broker needed.
 * Each open stream is bound to the projects its user belongs to; events are only delivered to members.
 * A person is "online" in a project while at least one of their streams is open.
 */
type Client = { userId: string; projectIds: Set<string>; res: Response };
const clients = new Set<Client>();

export type ServerEvent = { type: string; projectId: string; actor: { id: string; name: string } } & Record<string, unknown>;

const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

export function publish(e: ServerEvent) {
  const payload = frame(e.type, e);
  for (const c of clients) if (c.projectIds.has(e.projectId)) c.res.write(payload);
}

/** Deliver an event to one person only (all of their open tabs). */
export function sendToUser(userId: string, type: string, data: unknown) {
  const payload = frame(type, data);
  for (const c of clients) if (c.userId === userId) c.res.write(payload);
}

const connCount = (userId: string) => { let n = 0; for (const c of clients) if (c.userId === userId) n++; return n; };
export const onlineIn = (projectId: string) => {
  const s = new Set<string>();
  for (const c of clients) if (c.projectIds.has(projectId)) s.add(c.userId);
  return [...s];
};
const announce = (userId: string, projectId: string, online: boolean) =>
  publish({ type: "presence", projectId, actor: { id: userId, name: "" }, userId, online });

/** Start delivering a project's events to a user's open streams (they just joined). */
export const grant = (userId: string, projectId: string) => {
  let had = false;
  for (const c of clients) if (c.userId === userId) { c.projectIds.add(projectId); had = true; }
  if (had) announce(userId, projectId, true);
};
/** Stop delivering a project's events to a user (removed/left). userId omitted => everyone (project deleted). */
export const revoke = (projectId: string, userId?: string) => {
  let had = false;
  for (const c of clients) if (!userId || c.userId === userId) { if (c.projectIds.delete(projectId)) had = true; }
  if (userId && had) announce(userId, projectId, false);
};

export async function openStream(req: Request, res: Response) {
  const userId = req.user!.id;
  const memberships = await prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } });
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell nginx not to buffer the stream
  });
  res.write("retry: 3000\n\n");
  const mine = [...clients].filter((c) => c.userId === userId);
  while (mine.length >= 6) { const old = mine.shift()!; clients.delete(old); old.res.end(); } // cap tabs per user
  const wasOffline = connCount(userId) === 0;
  const client: Client = { userId, projectIds: new Set(memberships.map((m) => m.projectId)), res };
  clients.add(client);
  res.write(`event: ready\ndata: {}\n\n`);
  // who is online right now in each of my projects
  res.write(frame("presence.snapshot", { projects: Object.fromEntries([...client.projectIds].map((p) => [p, onlineIn(p)])) }));
  if (wasOffline) for (const p of client.projectIds) announce(userId, p, true);
  const heartbeat = setInterval(() => res.write(":hb\n\n"), 25_000); // keeps proxies from closing an idle stream
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
    const projects = [...client.projectIds];
    // a page refresh closes and reopens the stream: wait a moment before telling everyone the person left
    if (connCount(userId) === 0) setTimeout(() => { if (connCount(userId) === 0) for (const p of projects) announce(userId, p, false); }, 5000).unref();
  });
}
