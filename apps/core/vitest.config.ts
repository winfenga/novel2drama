import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // test/** 是既有收集区；src/**/*.test.ts 收 M5（src/llm）与 M6（src/shot）同目录测试——
    // 主会话 2026-11-10 派权扩展（M05 [001] / M06 [001] 两轨均请求）
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // e2e 起服务，单文件顺序跑足够，也避免端口/目录互相踩
    fileParallelism: false,
    testTimeout: 30000,
  },
});
