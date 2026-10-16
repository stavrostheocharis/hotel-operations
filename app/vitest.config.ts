import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/db/**/*.test.ts"],
    globalSetup: ["src/db/__tests__/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
