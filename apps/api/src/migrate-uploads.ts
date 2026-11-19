/**
 * One-off: copies every image in the uploads folder into the R2 bucket under the same file name, so the existing /api/uploads/<name> links
 * keep working once the disk copies are gone. Safe to run again (files already in the bucket are skipped). It never deletes anything.
 *   node dist/migrate-uploads.js
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NAME, UPLOAD_DIR } from "./uploads";

const { R2_ACCOUNT_ID: acc, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret } = process.env;
if (!acc || !bucket || !id || !secret) { console.error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set."); process.exit(1); }
const client = new S3Client({ region: "auto", endpoint: `https://${acc}.r2.cloudflarestorage.com`, credentials: { accessKeyId: id, secretAccessKey: secret } });
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

async function exists(key: string) {
  try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; }
  catch (e: any) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false; throw e; }
}

(async () => {
  let copied = 0, skipped = 0, bytes = 0;
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    if (!NAME.test(name)) continue;
    if (await exists(name)) { skipped++; continue; }
    const body = fs.readFileSync(path.join(UPLOAD_DIR, name));
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: body, ContentType: MIME[name.split(".")[1]], CacheControl: "public, max-age=31536000, immutable" }));
    copied++; bytes += body.length;
  }
  console.log(`Copied ${copied} image(s) (${(bytes / 1048576).toFixed(1)} MB) to R2; ${skipped} were already there.`);
})().catch((e) => { console.error("Migration failed:", e?.name ?? e, e?.message ?? ""); process.exit(1); });
