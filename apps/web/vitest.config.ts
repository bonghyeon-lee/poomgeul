import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for @poomgeul/web.
 *
 * Scope: component / unit tests under `src/**\/*.test.{ts,tsx}`.
 * Browser-level E2E uses Playwright (see playwright.config.ts).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
