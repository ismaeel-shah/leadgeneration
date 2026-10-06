import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests start an in-memory MongoDB replica set per file.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
