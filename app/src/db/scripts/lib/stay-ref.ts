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

/**
 * Pseudonym for a member of staff named in an export (a technician, an
 * agent). Performance is never modelled per person, so the console only
 * needs "the same person" to stay the same string; the name itself is not
 * stored. Same keyed HMAC, different domain.
 */
export function staffRef(propertyCode: string, name: string): string {
  const secret = process.env.STAY_REF_SECRET ?? "dev-only-change-me";
  const digest = createHmac("sha256", secret)
    .update(`staff:${propertyCode}:${name.trim().toLowerCase()}`)
    .digest("hex");
  return `staff_${digest.slice(0, 12)}`;
}
