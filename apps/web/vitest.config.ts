import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } }, // the app's tsconfig keeps JSX for Next.js; tests need it compiled
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
