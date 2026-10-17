import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        // Pure tests: no database. `pnpm test:unit` runs only these.
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/db/__tests__/**", "**/node_modules/**"],
          testTimeout: 60_000,
        },
      },
      {
        // Against a real Postgres: fresh test database, migrations, seed, load, normalise.
        extends: true,
        test: {
          name: "db",
          include: ["src/db/__tests__/*.test.ts"],
          globalSetup: ["src/db/__tests__/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
