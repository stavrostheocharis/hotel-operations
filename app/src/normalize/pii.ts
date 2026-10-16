/**
 * Personal-data scrubbing for free text at ingest. Deliberately conservative:
 * it must never eat room numbers ("312"), ticket numbers, reservation numbers
 * or timestamps, so phone detection requires phone-like structure.
 */

export type Redactions = Record<string, number>;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,4})?\b/g;
// Candidate runs of digits with phone separators; validated in code.
const PHONE_CANDIDATE = /(?:\+|00)?\(?\d[\d\s().-]{6,}\d/g;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

export function scrubPii(text: string): { text: string; redactions: Redactions } {
  const redactions: Redactions = {};
  const bump = (k: string) => {
    redactions[k] = (redactions[k] ?? 0) + 1;
  };
  let out = text.replace(EMAIL, () => {
    bump("email");
    return "[email]";
  });
  out = out.replace(IBAN, (m) => {
    if (!isIban(m)) return m;
    bump("iban");
    return "[iban]";
  });
  out = out.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 13 || !luhn(digits)) return m;
    bump("card");
    return "[card]";
  });
  out = out.replace(PHONE_CANDIDATE, (m) => {
    if (!looksLikePhone(m)) return m;
    bump("phone");
    return "[phone]";
  });
  return { text: out, redactions };
}

function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  // Dates and timestamps contain '/' or ':' which the candidate regex excludes,
  // but a run like "2026 13 44" could slip through: require phone structure.
  const trimmed = candidate.trim();
  if (/^(\+|00)/.test(trimmed)) return true;
  if (/^0\d/.test(trimmed)) return true;
  if (/^\(?\d{2,4}\)?[\s.-]\d{3}[\s.-]?\d{3,4}$/.test(trimmed)) return true;
  // Greek mobile (69x) and landline (2x) numbers written without separators.
  if (/^(69|2)\d{8}$/.test(digits) && !/\s/.test(trimmed)) return true;
  return false;
}

function isIban(s: string): boolean {
  const compact = s.replace(/[\s-]/g, "").toUpperCase();
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Scrub every string inside a JSON value (used for the raw export row). */
export function scrubValue<T>(value: T, redactions: Redactions = {}): { value: T; redactions: Redactions } {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = scrubPii(v);
      for (const [k, n] of Object.entries(r.redactions)) redactions[k] = (redactions[k] ?? 0) + n;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, redactions };
}
