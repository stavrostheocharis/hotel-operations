import { expect } from "vitest";

/**
 * Drizzle wraps driver errors ("Failed query: ...") and keeps the Postgres
 * message in `cause`. Walk the chain so tests can assert on what Postgres said.
 */
export async function expectDbError(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  if (caught === undefined) {
    throw new Error(`expected a database error matching ${pattern}`);
  }
  const messages: string[] = [];
  let current: unknown = caught;
  for (let depth = 0; current && depth < 6; depth++) {
    const e = current as { message?: unknown; cause?: unknown };
    messages.push(String(e.message ?? current));
    current = e.cause;
  }
  expect(messages.join(" | ")).toMatch(pattern);
}
