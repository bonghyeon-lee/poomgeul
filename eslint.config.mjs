// @ts-check
//
// Root ESLint flat config shared by every workspace.
// Formatting rules are deferred to Prettier (see prettier.config.mjs).
//
// Scope: TypeScript + JS in `apps/**` and `packages/**`. Build artefacts and
// tool metadata are ignored explicitly below.

import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/migrations/**",
      "packages/types/src/openapi.d.ts",
      "apps/web/next-env.d.ts",
      "apps/web/playwright-report/**",
      "apps/web/test-results/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Node-side packages & apps — Jest + Node globals.
  {
    files: ["apps/api/**/*.{ts,tsx,js,cjs,mjs}", "packages/**/*.{ts,tsx,js,cjs,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },

  // CommonJS tool configs (jest.config.cjs, next.config.*, etc.) use `module.exports`.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },

  // Browser-side (Next.js web) — includes src/**, e2e/**, and root config files.
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node, // next.config, scripts
      },
    },
    rules: {
      // Next.js: React JSX runtime is automatic, so React-in-scope is unnecessary.
      "no-undef": "off",
      // Bring Next's recommended + Core Web Vitals rules over. These are the
      // same rules `eslint-config-next` bundles; we wire them directly so the
      // monorepo root config stays framework-agnostic while `apps/web` gets
      // full coverage.
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
    settings: {
      next: {
        // @next/eslint-plugin-next needs to know where the Next app lives in
        // this pnpm workspace. See next.js/docs/.../eslint.mdx § Monorepo.
        rootDir: "apps/web/",
      },
    },
  },

  // Tests: relaxed typing in fixtures.
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/test/**/*.ts",
      "apps/web/e2e/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Common project rules.
  {
    rules: {
      // Encourage `_`-prefixed locals for knowingly unused args (DTO placeholders, etc.).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer `??` over `||` when the intent is null/undefined coalescing.
      // typescript-eslint ships this as a non-typed recommendation, keep it on.
    },
  },

  // Always last — disables any formatting-related rule that Prettier handles.
  prettier,
);
