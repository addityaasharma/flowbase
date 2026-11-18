import type { NextFunction, Request, Response } from "express";

/** Tiny in-memory fixed-window limiter keyed by client IP (good enough for a single-process deployment). */
export function rateLimit(name: string, max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_RATE_LIMIT === "1") return next(); // automated tests only
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return next(); }
    if (++h.n > max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: "Too many attempts, please try again later" });
    }
    next();
  };
}
