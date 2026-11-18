import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node", include: ["src/**/*.test.ts"], setupFiles: ["./test/setup.ts"],
    fileParallelism: false, testTimeout: 20_000,
  },
});
