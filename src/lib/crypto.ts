import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const PREFIX = "v1";

function keyFrom(b64: string | undefined): Buffer {
  if (!b64) throw new Error("SECRETS_KEY is not set: integration secrets cannot be stored");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("SECRETS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return key;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url. A fresh random IV per call. */
export function encryptWith(keyB64: string | undefined, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyB64), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptWith(keyB64: string | undefined, blob: string): string {
  const [v, iv, tag, body] = blob.split(".");
  if (v !== PREFIX || !iv || !tag || body === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export const encryptSecret = (plain: string) => encryptWith(env().SECRETS_KEY, plain);
export const decryptSecret = (blob: string) => decryptWith(env().SECRETS_KEY, blob);

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}
export function decryptJson<T>(blob: string): T {
  return JSON.parse(decryptSecret(blob)) as T;
}
