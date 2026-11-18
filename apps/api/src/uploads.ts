import type { Request, Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Pasted/attached images. Stored as <32 hex>.<ext> in UPLOAD_DIR (keep it outside the deployed code folder). */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const NAME = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;

/** Trust the bytes, not the client's Content-Type. SVG is deliberately not allowed (it can carry scripts). */
function sniff(b: Buffer): keyof typeof MIME | null {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a")) return "gif";
  if (b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export async function saveUpload(req: Request, res: Response) {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: "No image received" });
  const ext = sniff(body);
  if (!ext) return res.status(400).json({ error: "Only PNG, JPEG, GIF or WebP images are allowed" });
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), body, { flag: "wx" });
  res.status(201).json({ url: `/api/uploads/${name}` });
}

export function serveUpload(req: Request, res: Response) {
  const name = req.params.name;
  if (!NAME.test(name)) return res.status(404).json({ error: "Not found" }); // also blocks ../ tricks
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  res.set({
    "Content-Type": MIME[name.split(".")[1]],
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'",
    "Cache-Control": "public, max-age=31536000, immutable", // names are random and never reused
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  fs.createReadStream(file).pipe(res);
}
