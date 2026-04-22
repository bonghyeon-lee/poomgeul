/**
 * Jest config for @poomgeul/api.
 *
 * Test layering (path-based for clarity; TEST_LAYER env var selects a slice):
 *   - Unit:        `src/**\/*.spec.ts`            (no external deps, pure logic / TestingModule without DB)
 *   - Integration: `test/integration/**\/*.int-spec.ts`
 *                  (touches the real Postgres + pgvector via a test DB)
 *   - E2E:         `test/**\/*.e2e-spec.ts`       (boots NestApplication, drives via supertest)
 *
 *   TEST_LAYER=unit        → only unit
 *   TEST_LAYER=integration → only integration
 *   TEST_LAYER=e2e         → only e2e
 *   (unset)                → everything
 */

const LAYER = process.env.TEST_LAYER;

const testMatch = (() => {
  switch (LAYER) {
    case "unit":
      return ["<rootDir>/src/**/*.spec.ts"];
    case "integration":
      return ["<rootDir>/test/integration/**/*.int-spec.ts"];
    case "e2e":
      return ["<rootDir>/test/**/*.e2e-spec.ts"];
    default:
      return [
        "<rootDir>/src/**/*.spec.ts",
        "<rootDir>/test/integration/**/*.int-spec.ts",
        "<rootDir>/test/**/*.e2e-spec.ts",
      ];
  }
})();

const testPathIgnorePatterns = LAYER === "unit" ? ["<rootDir>/test/"] : [];

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch,
  testPathIgnorePatterns,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true, tsconfig: "tsconfig.test.json" }],
  },
  // Integration/e2e touch Postgres — serial to avoid DB races unless a
  // specific suite opts into its own testcontainer. Unit tests stay parallel.
  maxWorkers: LAYER === "unit" ? "50%" : 1,
};
