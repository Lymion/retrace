import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@tests": path.resolve(import.meta.dirname, "tests"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Tests never touch the real database or the real API.
    env: {
      NODE_ENV: "test",
      ANTHROPIC_API_KEY: "",
      GITHUB_TOKEN: "",
      RETRACE_DATA_DIR: path.join(os.tmpdir(), "retrace-test-data"),
    },
    testTimeout: 20_000,
  },
});
