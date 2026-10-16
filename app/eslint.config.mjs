import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The stock `cn` engine does not know the DESIGN.md scales; use the
      // configured one in src/lib/utils.ts (see that file).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "cn",
              message:
                "Import { cn } from \"@/lib/utils\" — it registers the DESIGN.md type, shadow and radius scales.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
