import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    // Claude Code isolated worktrees (gitignored, local scratch space) --
    // each has its own .next build output that isn't source to lint.
    ".claude/worktrees/**",
  ]),
  {
    // Specs must go through e2e/helpers/test, which extends `test` so each one
    // reaches the app with its own x-forwarded-for -- otherwise the whole suite
    // shares a single bucket against the per-(route, ip) rate limiter and trips
    // limits of 5-10 on its own (#587). Types are unaffected.
    files: ["e2e/**/*.spec.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@playwright/test",
              importNames: ["test", "expect"],
              message:
                "Import { test, expect } from './helpers/test' so the test gets its own client IP (#587). Type-only imports from @playwright/test are fine.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
