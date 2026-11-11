import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Encrypts small secrets at rest (MFA seeds) with AES-256-GCM. The key is
// derived from PLATFORM_ADMIN_SECRET, which lives only in server env vars.

function key(): Buffer {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PLATFORM_ADMIN_SECRET is missing or shorter than 32 characters.");
  }
  return createHash("sha256").update(`insight-admin:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted secret.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
