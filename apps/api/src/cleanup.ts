import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { NAME, UPLOAD_DIR, storage } from "./uploads";

const GRACE_MS = 24 * 3600_000; // a fresh upload may belong to a draft nobody has saved yet

/** True if any ticket description or comment still mentions this image. */
async function isReferenced(name: string) {
  if (await prisma.ticket.count({ where: { description: { contains: name } } })) return true;
  return (await prisma.comment.count({ where: { body: { contains: name } } })) > 0;
}

async function remove(name: string) {
  await storage.del(name); // disk and/or R2
  await prisma.upload.deleteMany({ where: { name } });
}

/**
 * Frees disk: deletes images (older than a day) that no description or comment uses any more — unsaved drafts,
 * removed images, deleted tickets/comments/projects — plus stray files on disk that are not tracked and not used.
 */
export async function cleanupUploads(): Promise<{ removed: number; bytes: number }> {
  const cutoff = new Date(Date.now() - GRACE_MS);
  let removed = 0, bytes = 0;
  // 1) tracked images
  for (;;) {
    const batch = await prisma.upload.findMany({ where: { createdAt: { lt: cutoff } }, orderBy: { createdAt: "asc" }, take: 200, skip: 0 });
    let progressed = false;
    for (const u of batch) {
      if (await isReferenced(u.name)) continue;
      await remove(u.name); removed++; bytes += u.bytes; progressed = true;
    }
    if (!progressed || batch.length < 200) break; // nothing more to delete in this pass
  }
  // 2) files on disk that have no row (e.g. the uploader's row was removed)
  const tracked = new Set((await prisma.upload.findMany({ select: { name: true } })).map((u) => u.name));
  for (const name of await fs.promises.readdir(UPLOAD_DIR)) {
    if (!NAME.test(name) || tracked.has(name)) continue;
    const st = await fs.promises.stat(path.join(UPLOAD_DIR, name)).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < GRACE_MS || (await isReferenced(name))) continue;
    await fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {}); removed++; bytes += st.size;
  }
  return { removed, bytes };
}

/** Inbox housekeeping: read entries are kept 30 days, anything at most 90 days. */
export async function cleanupNotifications() {
  const d = (days: number) => new Date(Date.now() - days * 86400_000);
  return prisma.notification.deleteMany({ where: { OR: [{ readAt: { lt: d(30) } }, { createdAt: { lt: d(90) } }] } });
}

/** Runs shortly after start-up and then every 6 hours. */
export function startUploadCleanup() {
  const run = () => cleanupNotifications().then(() => cleanupUploads())
    .then((r) => { if (r.removed) console.log(`[uploads] cleanup removed ${r.removed} unused image(s), freed ${(r.bytes / 1048576).toFixed(1)} MB`); })
    .catch((e) => console.error("[uploads] cleanup failed", e));
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3600_000).unref();
}
