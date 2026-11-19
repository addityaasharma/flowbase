import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db";
import { als, resolveToken } from "./tokens";
import { tokenMayCall } from "./policy";

const SECRET = process.env.JWT_SECRET || "dev-secret";
if (process.env.NODE_ENV === "production" && SECRET === "dev-secret") throw new Error("JWT_SECRET must be set in production");

export type AuthUser = { id: string; name: string };
declare global { namespace Express { interface Request { user?: AuthUser } } }

export const signToken = (id: string, version = 0) => jwt.sign({ sub: id, v: version }, SECRET, { expiresIn: "30d" });

/** Who is signed in on a PUBLIC route (a person's own session only, never a personal access token). Null if nobody, or the session is stale. */
export async function sessionUser(req: Request) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ") || h.startsWith("Bearer fb_")) return null;
    const { sub, v } = jwt.verify(h.slice(7), SECRET) as { sub: string; v?: number };
    const u = await prisma.user.findUnique({ where: { id: sub } });
    return u && u.active && (v ?? 0) === u.tokenVersion ? u : null;
  } catch { return null; }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.headers.authorization?.startsWith("Bearer fb_")) { // a personal access token (Claude / agents)
      const a = await resolveToken(req, res); if (!a) return;
      if (a.level === "tasks") return res.status(401).json({ error: "Unauthorized" }); // "tasks only" tokens use /api/agent and /api/mcp
      if (!tokenMayCall(a.level, req.method, req.path)) return res.status(403).json({ error: "This token's access level doesn't allow that action." });
      req.user = { id: a.user.id, name: a.user.name }; req.agent = a;
      return als.run({ via: a.tokenName }, () => next()); // everything this request does is marked "via <token>"
    }
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const { sub, v } = jwt.verify(h.slice(7), SECRET) as { sub: string; v?: number };
    const u = await prisma.user.findUnique({ where: { id: sub } });
    if (!u || !u.active || (v ?? 0) !== u.tokenVersion) return res.status(401).json({ error: "Unauthorized" }); // old session after a password change
    req.user = { id: u.id, name: u.name };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
