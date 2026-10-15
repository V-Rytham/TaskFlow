import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.tsx"], testTimeout: 30000, maxWorkers: 1 },
});
