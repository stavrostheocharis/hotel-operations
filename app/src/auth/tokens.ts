import { createHash, randomBytes } from "node:crypto";

/** Session tokens: random in the cookie, hashed in the database. Pure, so tests and scripts can use them. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
