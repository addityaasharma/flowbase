import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db";

const SECRET = process.env.JWT_SECRET || "dev-secret";
if (process.env.NODE_ENV === "production" && SECRET === "dev-secret") throw new Error("JWT_SECRET must be set in production");

export type AuthUser = { id: string; name: string };
declare global { namespace Express { interface Request { user?: AuthUser } } }

export const signToken = (id: string) => jwt.sign({ sub: id }, SECRET, { expiresIn: "30d" });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const { sub } = jwt.verify(h.slice(7), SECRET) as { sub: string };
    const u = await prisma.user.findUnique({ where: { id: sub } });
    if (!u || !u.active) return res.status(401).json({ error: "Unauthorized" });
    req.user = { id: u.id, name: u.name };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
