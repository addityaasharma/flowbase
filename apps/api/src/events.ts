import type { Request, Response } from "express";
import { prisma } from "./db";

/**
 * In-memory realtime hub (Server-Sent Events). One API process => no broker needed.
 * Each open stream is bound to the projects its user belongs to; events are only delivered to members.
 */
type Client = { userId: string; projectIds: Set<string>; res: Response };
const clients = new Set<Client>();

export type ServerEvent = { type: string; projectId: string; actor: { id: string; name: string } } & Record<string, unknown>;

export function publish(e: ServerEvent) {
  const payload = `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
  for (const c of clients) if (c.projectIds.has(e.projectId)) c.res.write(payload);
}

/** Start delivering a project's events to a user's open streams (they just joined). */
export const grant = (userId: string, projectId: string) => { for (const c of clients) if (c.userId === userId) c.projectIds.add(projectId); };
/** Stop delivering a project's events to a user (removed/left). userId omitted => everyone (project deleted). */
export const revoke = (projectId: string, userId?: string) => {
  for (const c of clients) if (!userId || c.userId === userId) c.projectIds.delete(projectId);
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
  const client: Client = { userId, projectIds: new Set(memberships.map((m) => m.projectId)), res };
  clients.add(client);
  res.write(`event: ready\ndata: {}\n\n`);
  const heartbeat = setInterval(() => res.write(":hb\n\n"), 25_000); // keeps proxies from closing an idle stream
  req.on("close", () => { clearInterval(heartbeat); clients.delete(client); });
}
