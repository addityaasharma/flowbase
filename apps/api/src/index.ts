import "dotenv/config";
import { app } from "./app";
import { startUploadCleanup } from "./cleanup";
import { startReminderJob } from "./reminders";
import { alertError } from "./mail";

process.on("unhandledRejection", (e) => { console.error("unhandledRejection", e); void alertError("unhandled promise rejection", e); });
process.on("uncaughtException", (e) => { console.error("uncaughtException", e); alertError("uncaught exception", e).finally(() => process.exit(1)); });

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => { console.log(`API listening on :${port}`); startUploadCleanup(); startReminderJob(); });
