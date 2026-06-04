import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // 复用 tsconfig 的 `@/*` 别名,单测里能 import 项目模块(prisma 等)
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
