import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { router } from "./routes";
import { startUploadCleanup } from "./cleanup";
import { startReminderJob } from "./reminders";
import { alertError } from "./mail";

const app = express();
app.set("trust proxy", 1); // behind nginx: real client IP for rate limiting
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "100kb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true })); // reachable through nginx for deploy health checks
app.use("/api", router);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
  const status = (err as { status?: number })?.status;
  if (status === 413) return res.status(413).json({ error: "That file is too large (images can be up to 5 MB)" });
  if (status === 400) return res.status(400).json({ error: "Malformed request" });
  const code = (err as { code?: string })?.code;
  if (code === "P2025") return res.status(404).json({ error: "Not found" });
  if (code === "P2002") return res.status(409).json({ error: "Already exists" });
  console.error(err);
  void alertError(`${req.method} ${req.path}`, err);
  res.status(500).json({ error: "Internal server error" });
});

process.on("unhandledRejection", (e) => { console.error("unhandledRejection", e); void alertError("unhandled promise rejection", e); });
process.on("uncaughtException", (e) => { console.error("uncaughtException", e); alertError("uncaught exception", e).finally(() => process.exit(1)); });

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => { console.log(`API listening on :${port}`); startUploadCleanup(); startReminderJob(); });
