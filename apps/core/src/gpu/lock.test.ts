/**
 * M9-0 测试 · GPU 全局锁（spec §3.3 重点用例：acquire 冲突 / release 幂等 / status）。
 */
import { describe, expect, it } from "vitest";
import { DramaError } from "@text2drama/shared";

import { createGpuLock } from "./lock.js";

describe("createGpuLock", () => {
  it("空闲时可 acquire，status 记录 holder", async () => {
    const lock = createGpuLock();
    expect(lock.status()).toEqual({ holder: null });
    await lock.acquire("tts");
    expect(lock.status()).toEqual({ holder: "tts" });
  });

  it("被占时 acquire 抛 gpu_lock_held(409) 带 holder", async () => {
    const lock = createGpuLock();
    await lock.acquire("comfyui");
    await expect(lock.acquire("tts")).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(DramaError);
      const de = e as DramaError;
      expect(de.code).toBe("gpu_lock_held");
      expect(de.http).toBe(409);
      expect(de.details).toMatchObject({ holder: "comfyui", requested: "tts" });
      return true;
    });
    // 冲突后锁不被破坏，仍归原 holder
    expect(lock.status()).toEqual({ holder: "comfyui" });
  });

  it("release 后可被另一方 acquire", async () => {
    const lock = createGpuLock();
    await lock.acquire("tts");
    lock.release("tts");
    expect(lock.status()).toEqual({ holder: null });
    await lock.acquire("video2x");
    expect(lock.status()).toEqual({ holder: "video2x" });
  });

  it("release 幂等：非 holder 调用忽略，不抛、不动锁", async () => {
    const lock = createGpuLock();
    await lock.acquire("comfyui");
    // 非当前 holder 的 release
    expect(() => lock.release("tts")).not.toThrow();
    expect(() => lock.release("video2x")).not.toThrow();
    expect(lock.status()).toEqual({ holder: "comfyui" });
    // 空锁上的重复 release
    lock.release("comfyui");
    expect(() => lock.release("comfyui")).not.toThrow();
    expect(lock.status()).toEqual({ holder: null });
  });

  it("同 holder 重入 acquire 放行（TTS 持锁段内 load 幂等不自我冲突）；跨类仍拒绝", async () => {
    const lock = createGpuLock();
    await lock.acquire("tts");
    await expect(lock.acquire("tts")).resolves.toBeUndefined();
    await expect(lock.acquire("comfyui")).rejects.toMatchObject({ code: "gpu_lock_held" });
    expect(lock.status()).toEqual({ holder: "tts" });
  });

  it("非法 holder 抛 invalid_param", async () => {
    const lock = createGpuLock();
    await expect(lock.acquire("hack" as never)).rejects.toMatchObject({ code: "invalid_param" });
    expect(() => lock.release("hack")).toThrow(DramaError);
  });
});
