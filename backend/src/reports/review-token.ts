import { createHash, randomBytes } from "crypto";

/** 256 random bits, URL-safe. It carries no data about the report or the user — it's only a lookup key. */
export const newReviewToken = (): string => randomBytes(32).toString("base64url");
export const hashReviewToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const looksLikeReviewToken = (token: string | undefined): token is string => !!token && /^[A-Za-z0-9_-]{43}$/.test(token);
