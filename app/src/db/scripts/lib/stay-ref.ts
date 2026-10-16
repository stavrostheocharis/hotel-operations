import { createHmac } from "node:crypto";

/**
 * Pseudonymous stay key. Operational tables carry only this; the mapping back
 * to the PMS reservation number lives in pii.stay_keys. Keyed HMAC so the
 * reservation number cannot be recovered from the ref without the secret.
 */
export function stayRef(propertyCode: string, reservationNo: string): string {
  const secret = process.env.STAY_REF_SECRET ?? "dev-only-change-me";
  const digest = createHmac("sha256", secret)
    .update(`${propertyCode}:${reservationNo.trim()}`)
    .digest("hex");
  return `stay_${digest.slice(0, 24)}`;
}
