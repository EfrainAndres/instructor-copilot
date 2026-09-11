import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/session-engine/**/*.test.ts"],
    environment: "node"
  }
});
