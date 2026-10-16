import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests (tests/integration) boot Express against a real
    // Postgres and self-skip unless TEST_DATABASE_URL is set; the longer
    // timeouts keep DB round-trips and app startup from tripping the defaults.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
