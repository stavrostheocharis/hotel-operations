import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (this file lives in app/src/db/scripts/lib). */
export const repoRoot = path.resolve(here, "../../../../..");

/** Where the hotel exports are. Defaults to the synthetic data/out. */
export function dataDir(): string {
  const configured = process.env.DATA_DIR;
  if (configured) return path.resolve(process.cwd(), configured);
  return path.join(repoRoot, "data", "out");
}

export function resortConfigPath(): string {
  return path.join(repoRoot, "data", "resort.yaml");
}

export function migrationsFolder(): string {
  return path.join(repoRoot, "app", "drizzle");
}

/** Where uploaded client exports land, one folder per import batch. */
export function uploadsDir(): string {
  const configured = process.env.UPLOADS_DIR;
  if (configured) return path.resolve(process.cwd(), configured);
  return path.join(repoRoot, "data", "uploads");
}
