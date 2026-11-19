import type { Request, Response } from "express";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";

/** Pasted/attached images. Stored as <32 hex>.<ext> in UPLOAD_DIR (keep it outside the deployed code folder). */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Where the image bytes live. With the R2_* settings present, new images go to a private Cloudflare R2 bucket and are streamed back through
 * the API (same URL, same security headers). Without them, everything stays on this disk (development, tests). Images that are still only
 * on disk keep being served from there, so moving to R2 never breaks an existing link.
 */
export type Stored = { stream: Readable; length?: number };
export type Storage = { remote: boolean; put(name: string, body: Buffer, mime: string): Promise<void>; get(name: string): Promise<Stored | null>; del(name: string): Promise<void> };

export const diskStorage: Storage = {
  remote: false,
  put: (name, body) => fs.promises.writeFile(path.join(UPLOAD_DIR, name), body, { flag: "wx" }),
  async get(name) {
    const file = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(file)) return null;
    return { stream: fs.createReadStream(file) };
  },
  del: (name) => fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {}),
};

type Sender = { send(cmd: unknown): Promise<any> };
export function r2Storage(client: Sender, bucket: string): Storage {
  return {
    remote: true,
    async put(name, body, mime) { await client.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: body, ContentType: mime, CacheControl: "public, max-age=31536000, immutable" })); },
    async get(name) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: name }));
        return out.Body ? { stream: out.Body as Readable, length: out.ContentLength } : null;
      } catch (e: any) {
        if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async del(name) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: name })); },
  };
}
/** R2 for new images; the disk is still consulted for older ones (and cleaned alongside). */
export const layered = (remote: Storage): Storage => ({
  remote: true,
  put: (n, b, m) => remote.put(n, b, m),
  async get(n) { return (await diskStorage.get(n)) ?? remote.get(n); },
  async del(n) { await diskStorage.del(n); await remote.del(n).catch((e) => console.error("[uploads] R2 delete failed", n, e?.name ?? e)); },
});

function fromEnv(): Storage {
  const { R2_ACCOUNT_ID: acc, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret } = process.env;
  if (!acc || !bucket || !id || !secret) return diskStorage;
  return layered(r2Storage(new S3Client({ region: "auto", endpoint: `https://${acc}.r2.cloudflarestorage.com`, credentials: { accessKeyId: id, secretAccessKey: secret } }), bucket));
}
export let storage: Storage = fromEnv();
export const setStorage = (s: Storage) => { storage = s; }; // tests

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
export const NAME = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;

// Storage guards: nobody can fill the server. All overridable by environment variable; read per request so they are easy to tune.
const MB = 1024 * 1024;
const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
export const limits = () => ({
  userQuota: num(process.env.UPLOAD_USER_QUOTA_MB, 100) * MB,     // images one person may keep stored
  userPerDay: num(process.env.UPLOAD_USER_PER_DAY, 100),          // uploads per person per 24h
  totalMax: num(process.env.UPLOAD_TOTAL_MAX_MB, storage.remote ? 8192 : 2048) * MB, // all images together (R2's free tier is 10 GB)
  minFree: num(process.env.UPLOAD_MIN_FREE_MB, 5120) * MB,        // stop accepting images if the disk has less than this free
});

/** Trust the bytes, not the client's Content-Type. SVG is deliberately not allowed (it can carry scripts). */
function sniff(b: Buffer): keyof typeof MIME | null {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a")) return "gif";
  if (b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

const fmt = (bytes: number) => (bytes >= MB ? `${Math.round(bytes / MB)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export async function saveUpload(req: Request, res: Response) {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: "No image received" });
  const ext = sniff(body);
  if (!ext) return res.status(400).json({ error: "Only PNG, JPEG, GIF or WebP images are allowed" });

  const L = limits(), userId = req.user!.id;
  const since = new Date(Date.now() - 24 * 3600_000);
  const [mine, today, all] = await Promise.all([
    prisma.upload.aggregate({ _sum: { bytes: true }, where: { userId } }),
    prisma.upload.count({ where: { userId, createdAt: { gt: since } } }),
    prisma.upload.aggregate({ _sum: { bytes: true } }),
  ]);
  if (today >= L.userPerDay) return res.status(429).json({ error: `Daily image limit reached (${L.userPerDay} per day). Try again tomorrow.` });
  if ((mine._sum.bytes ?? 0) + body.length > L.userQuota) return res.status(413).json({ error: `You've reached your image storage limit (${fmt(L.userQuota)}). Images that are no longer used are removed automatically after a day.` });
  let free = Infinity; // the free-disk floor only matters when images are written to this disk
  if (!storage.remote) try { const s = await fs.promises.statfs(UPLOAD_DIR); free = s.bavail * s.bsize; } catch { /* statfs unsupported: rely on the other limits */ }
  if ((all._sum.bytes ?? 0) + body.length > L.totalMax || free - body.length < L.minFree)
    return res.status(507).json({ error: "Image storage is full right now. Please tell an administrator." });

  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  await storage.put(name, body, MIME[ext]);
  try {
    await prisma.upload.create({ data: { name, bytes: body.length, userId } });
  } catch (e) {
    await storage.del(name).catch(() => {}); // never keep a file we are not tracking
    throw e;
  }
  res.status(201).json({ url: `/api/uploads/${name}` });
}

export async function serveUpload(req: Request, res: Response) {
  const name = req.params.name;
  if (!NAME.test(name)) return res.status(404).json({ error: "Not found" }); // also blocks ../ tricks
  let found: Stored | null = null;
  try { found = await storage.get(name); } catch (e) { console.error("[uploads] read failed", name, e); return res.status(502).json({ error: "Image storage is unavailable" }); }
  if (!found) return res.status(404).json({ error: "Not found" });
  res.set({
    "Content-Type": MIME[name.split(".")[1]],
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'",
    "Cache-Control": "public, max-age=31536000, immutable", // names are random and never reused
    "Cross-Origin-Resource-Policy": "cross-origin",
    ...(found.length !== undefined ? { "Content-Length": String(found.length) } : {}),
  });
  found.stream.on("error", () => res.destroy());
  found.stream.pipe(res);
}
