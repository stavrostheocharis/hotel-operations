import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const production = () => process.env.NODE_ENV === "production";

/** The app folder (this file lives in app/src/db/scripts/lib) and the repository root above it. */
export const appRoot = path.resolve(here, "../../../..");
export const repoRoot = path.resolve(appRoot, "..");

/**
 * Where the hotel exports are, for the scripts (seed, load-synthetic,
 * reality-check): DATA_DIR, else the synthetic data/out of a checkout.
 */
export function dataDir(): string {
  const configured = process.env.DATA_DIR;
  if (configured) return path.resolve(process.cwd(), configured);
  return path.join(repoRoot, "data", "out");
}

/**
 * The folder the console offers as "the exports already on the server":
 * DATA_DIR when set; in development the synthetic season; in production
 * nothing unless an operator pointed DATA_DIR at a real folder.
 */
export function demoFolder(): string | null {
  const configured = process.env.DATA_DIR;
  if (configured) return path.resolve(process.cwd(), configured);
  return production() ? null : path.join(repoRoot, "data", "out");
}

export function resortConfigPath(): string {
  return path.join(repoRoot, "data", "resort.yaml");
}

export function migrationsFolder(): string {
  return path.join(appRoot, "drizzle");
}

/**
 * Where uploaded client exports land, one folder per import batch. The
 * web app and the worker must see the same folder, so production sets
 * UPLOADS_DIR explicitly (a shared volume); a checkout uses data/uploads.
 */
export function uploadsDir(): string {
  const configured = process.env.UPLOADS_DIR;
  if (configured) return path.resolve(process.cwd(), configured);
  if (production()) throw new Error("UPLOADS_DIR is not set; the web app and the worker need one shared uploads folder");
  return path.join(repoRoot, "data", "uploads");
}
