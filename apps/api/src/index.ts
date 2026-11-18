import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { router } from "./routes";

const app = express();
app.set("trust proxy", 1); // behind nginx: real client IP for rate limiting
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "100kb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true })); // reachable through nginx for deploy health checks
app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
  const code = (err as { code?: string })?.code;
  if (code === "P2025") return res.status(404).json({ error: "Not found" });
  if (code === "P2002") return res.status(409).json({ error: "Already exists" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
