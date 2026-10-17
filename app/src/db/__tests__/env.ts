import "dotenv/config";

export const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/hotel_ops_test";

export const TEST_APP_URL =
  process.env.TEST_DATABASE_URL_APP ??
  "postgres://app_user:app_user@localhost:5432/hotel_ops_test";

/** Password of every demo user in the test database. */
export const TEST_PASSWORD = "test-pass-2026";
