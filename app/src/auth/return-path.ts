/**
 * A `?next=` value is honoured only when it is a path on this site: one
 * leading slash, then neither a slash nor a backslash (browsers read
 * "/\\evil.com" as "//evil.com"), no scheme, no control characters.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/^\/(?![/\\])/.test(raw)) return null;
  if (/[\u0000-\u001f\s]/.test(raw)) return null;
  try {
    const u = new URL(raw, "http://local");
    if (u.origin !== "http://local") return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}
