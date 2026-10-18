import { AuthorizationError } from "@/auth/permissions";
import { t } from "@/i18n";
import { JobAlreadyRunning } from "@/jobs/runner";

/**
 * What a failed action tells the person. Our own messages (thrown with
 * dictionary text, or short plain English) pass through; anything from a
 * library — Postgres, the model, the runtime — is logged on the server and
 * replaced with one sentence, so no connection string, policy name or
 * stack detail reaches a toast.
 */
const LIBRARY_ERRORS = new Set(["PostgresError", "APIError", "APIConnectionError", "TypeError", "RangeError", "SyntaxError", "AbortError", "AggregateError"]);

export function failureMessage(err: unknown): string {
  if (err instanceof AuthorizationError) return t("common.notAllowed");
  if (err instanceof JobAlreadyRunning) return t("jobs.toast.alreadyRunning");
  if (err instanceof Error) {
    const name = err.name || err.constructor?.name || "";
    const libraryLike = LIBRARY_ERRORS.has(name) || /ECONN|ENOTFOUND|ETIMEDOUT|EACCES|ENOENT|connection|password authentication|relation "|column "|violates|syntax error|permission denied/i.test(err.message);
    if (libraryLike) {
      console.error("[action]", err);
      return t("common.failed");
    }
    return err.message;
  }
  console.error("[action]", err);
  return t("common.failed");
}
