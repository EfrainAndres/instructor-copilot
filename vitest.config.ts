import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/session-engine/**/*.test.ts", "src/renderer/src/**/*.test.ts"],
    environment: "node"
  }
});
