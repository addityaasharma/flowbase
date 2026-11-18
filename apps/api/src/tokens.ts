import crypto from "node:crypto";
/** Access tokens look like fb_<40 random chars> (≈240 bits). Only their SHA-256 hash is ever stored. */
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const newToken = () => `fb_${crypto.randomBytes(30).toString("base64url")}`;
