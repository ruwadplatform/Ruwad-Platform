import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** AES-256-GCM for OAuth tokens at rest. The key comes from the
 * TOKEN_ENCRYPTION_KEY environment variable (32 random bytes, base64).
 * Stored form: "v1.<iv>.<authTag>.<ciphertext>" (each base64url). A wrong key or
 * a tampered value fails authentication instead of returning garbage. */
export class TokenCrypto {
  private readonly key: Buffer | null;

  constructor(base64Key: string | undefined) {
    const key = base64Key ? Buffer.from(base64Key.trim(), "base64") : null;
    this.key = key && key.length === 32 ? key : null;
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string): string {
    if (!this.key) throw new Error("Token encryption key is not configured");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
  }

  decrypt(stored: string): string {
    if (!this.key) throw new Error("Token encryption key is not configured");
    const [v, iv, tag, ct] = stored.split(".");
    if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised token format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  }
}
