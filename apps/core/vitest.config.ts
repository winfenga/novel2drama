import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // e2e 起服务，单文件顺序跑足够，也避免端口/目录互相踩
    fileParallelism: false,
    testTimeout: 30000,
  },
});
