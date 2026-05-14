import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
