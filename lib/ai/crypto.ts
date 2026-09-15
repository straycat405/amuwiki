import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Ciphertext layout: v1.<iv>.<auth tag>.<data>, all base64url. The version prefix
// lets a future KMS-backed format coexist during re-encryption.
const VERSION = "v1";
const IV_BYTES = 12;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptApiKey(plainKey: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const data = Buffer.concat([cipher.update(plainKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data].map((part) => part.toString("base64url")).join(".");
}

export function decryptApiKey(ciphertext: string, secret: string): string {
  const [version, iv, tag, data] = ciphertext.split(".");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("unsupported_ciphertext");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function apiKeyHint(plainKey: string): string {
  return plainKey.slice(-4);
}
