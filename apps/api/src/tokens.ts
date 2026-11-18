import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response } from "express";
import { prisma } from "./db";

/** Access tokens look like fb_<40 random chars> (≈240 bits). Only their SHA-256 hash is ever stored. */
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const newToken = () => `fb_${crypto.randomBytes(30).toString("base64url")}`;

export type AccessLevel = "tasks" | "collaborator" | "full";
export type Agent = { tokenId: string; tokenName: string; level: AccessLevel; canCommentOthers: boolean; raw: string; user: { id: string; name: string } };
declare global { namespace Express { interface Request { agent?: Agent } } }

/** Carries "who is acting on someone's behalf" through a request, so every activity entry / comment / notification can say "via <token>". */
export const als = new AsyncLocalStorage<{ via?: string }>();
export const currentVia = () => als.getStore()?.via;

// per-token rate limit: 120 requests / minute
const hits = new Map<string, { n: number; reset: number }>();

/** Validates the bearer token and returns who it acts as. Sends the error response itself (and returns null) when it can't. */
export async function resolveToken(req: Request, res: Response): Promise<Agent | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer fb_")) { res.status(401).json({ error: "Missing or invalid access token. Create one in Flowbase → Profile → Developer access." }); return null; }
  const raw = h.slice(7);
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date()) || !row.user.active) { res.status(401).json({ error: "This access token is invalid, expired or revoked." }); return null; }
  const now = Date.now(), b = hits.get(row.id);
  if (!b || b.reset < now) hits.set(row.id, { n: 1, reset: now + 60_000 });
  else if (++b.n > 120) { res.setHeader("Retry-After", Math.ceil((b.reset - now) / 1000)); res.status(429).json({ error: "Too many requests. Slow down and retry in a minute." }); return null; }
  if (!row.lastUsedAt || now - +row.lastUsedAt > 60_000) void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { tokenId: row.id, tokenName: row.name, level: (row.level as AccessLevel) ?? "tasks", canCommentOthers: row.canCommentOthers, raw, user: { id: row.user.id, name: row.user.name } };
}
