"use server";

import { sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnPath } from "./return-path";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { hashToken, newSessionToken, PROPERTY_COOKIE, SESSION_COOKIE, SESSION_DAYS, sessionCookieOptions } from "./session";
import { getViewer, requireViewer } from "./viewer";

export type SignInState = { error: string | null };

/** Five failed attempts per email per 15 minutes, per process. */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;

function tooManyAttempts(email: string): boolean {
  const now = Date.now();
  const a = attempts.get(email);
  if (!a || a.resetAt < now) return false;
  return a.count >= MAX_ATTEMPTS;
}

function recordFailure(email: string) {
  const now = Date.now();
  const a = attempts.get(email);
  if (!a || a.resetAt < now) attempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
  else a.count++;
}

/** Only same-site paths are honoured as a return target. */
function safeNext(raw: FormDataEntryValue | null): string {
  return safeReturnPath(typeof raw === "string" ? raw : null) ?? "/today";
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!email || !password) return { error: t("signIn.errors.missing") };
  if (tooManyAttempts(email)) return { error: t("signIn.errors.tooMany") };

  const db = getAppDb();
  const [cred] = await db.execute<{ user_id: string; group_id: string; is_active: boolean; password_hash: string }>(
    sql`select * from auth_credentials(${email})`,
  );
  const ok = cred ? await verifyPassword(password, cred.password_hash) : await verifyPassword(password, DUMMY_HASH).then(() => false);
  if (!cred || !ok || !cred.is_active) {
    recordFailure(email);
    return { error: cred && !cred.is_active && ok ? t("signIn.errors.inactive") : t("signIn.errors.wrong") };
  }
  attempts.delete(email);

  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.execute(sql`select auth_create_session(${cred.user_id}, ${hashToken(token)}, ${expires.toISOString()}::timestamptz, ${userAgent})`);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  redirect(next);
}

/** A real hash so a wrong email costs the same time as a wrong password. */
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getAppDb().execute(sql`select auth_delete_session(${hashToken(token)})`);
  store.delete(SESSION_COOKIE);
  store.delete(PROPERTY_COOKIE);
  redirect("/sign-in");
}

/** Remember which property the console shows; only one the viewer may see. */
export async function switchProperty(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  const id = String(formData.get("propertyId") ?? "");
  if (!viewer || !viewer.properties.some((p) => p.id === id)) return;
  (await cookies()).set(PROPERTY_COOKIE, id, { ...sessionCookieOptions(new Date(Date.now() + 365 * 86_400_000)), httpOnly: true });
  redirect("/today");
}

export type PasswordState = { ok: boolean; message: string; at: number } | null;

/**
 * "Change password" from the user menu: the current password must match,
 * the new one must pass the policy. auth_set_password signs every session
 * of the user out, so this one is re-issued in the same call.
 */
export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const viewer = await requireViewer();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) return { ok: false, message: t("user.password.mismatch"), at: Date.now() };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, message: problem, at: Date.now() };
  const db = getAppDb();
  const [cred] = await db.execute<{ user_id: string; password_hash: string }>(sql`select * from auth_credentials(${viewer.user.email})`);
  if (!cred || cred.user_id !== viewer.user.id || !(await verifyPassword(current, cred.password_hash))) {
    return { ok: false, message: t("user.password.wrong"), at: Date.now() };
  }
  await db.execute(sql`select auth_set_password(${viewer.user.id}, ${await hashPassword(next)})`);
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.execute(sql`select auth_create_session(${viewer.user.id}, ${hashToken(token)}, ${expires.toISOString()}::timestamptz, ${userAgent})`);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  return { ok: true, message: t("user.password.saved"), at: Date.now() };
}
