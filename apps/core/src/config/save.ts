/**
 * 配置原子写盘 —— temp + fsync + rename + chmod 0600。
 *
 * 冻结签名：`docs/m0-spec.md` §5.10（`saveConfig(cfg, env?): void`）。
 * 依据：`docs/api-contract.md` §5.4（L694-700 的临时文件 + rename）、`architecture.md` L374-376。
 *
 * ⚠️ 写路径恒为 `paths.configFile`（新 home 下）。`paths.legacyConfigFile` 是**只读**回退，
 *    由 `loadConfig` 决定要不要读它；写绝不落回旧目录（`m0-spec.md` §9 漂移 D9）。
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import { resolvePaths } from "../paths.js";
import type { DramaConfig } from "./types.js";

/** 目录权限：仅属主可进入 */
const DIR_MODE = 0o700;
/** 配置文件权限：仅属主可读写 */
const FILE_MODE = 0o600;

/**
 * `chmod` 在 Windows 上基本无效（映射到只读属性），且某些文件系统不支持
 * （EPERM / ENOSYS）。调用它的目的是在 POSIX 上真正收紧权限，
 * 失败不影响配置本身可读可用，因此只吞这两种错误码。
 */
function chmodQuiet(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // 仅忽略「该平台/该文件系统不支持 chmod」这一类；其余错误（如 ENOENT）照抛
    if (code !== "EPERM" && code !== "ENOSYS") throw e;
  }
}

/**
 * 把配置写盘。**要么完整成功，要么旧文件原样保留**。
 *
 * 顺序（不可调换）：
 * 1. 目录不存在 → `mkdirSync(recursive, 0o700)` + chmod 0700
 * 2. 写同目录临时文件 `${file}.${pid}.tmp`，mode 0600（**必须同目录**，跨盘 rename 会 EXDEV）
 * 3. `fsync` 落盘，再 `close`（fsync 必须在 close 之前）
 * 4. `rename` 原子替换
 * 5. chmod 0600 兜底
 *
 * 任一步失败：删掉临时文件（尽力而为）后原样上抛，**不吞异常、不留半截配置**。
 */
export function saveConfig(cfg: DramaConfig, env: NodeJS.ProcessEnv = process.env): void {
  const paths = resolvePaths(env);
  // configFile 恒为写路径（新 home 下），不再有 legacy 回退需要绕
  const file = paths.configFile;
  const dir = dirname(file);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  }
  // 已存在的目录也要收紧（mkdir 的 mode 只在新建时生效）
  chmodQuiet(dir, DIR_MODE);

  const temp = `${file}.${process.pid}.tmp`;
  const body = `${JSON.stringify(cfg, null, 2)}\n`;

  try {
    const fd = openSync(temp, "w", FILE_MODE);
    try {
      writeSync(fd, body, null, "utf8");
      // 先 fsync 再 close：保证 rename 之后不会出现「文件名在、内容空」的崩溃窗口
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
    chmodQuiet(file, FILE_MODE);
  } catch (e) {
    // 清掉可能残留的临时文件；清理本身失败不掩盖原始错误
    try {
      if (existsSync(temp)) unlinkSync(temp);
    } catch {
      // 故意吞：临时文件残留只是垃圾，原始写盘错误才是要报给调用方的
    }
    throw new Error(`配置写盘失败：${file}`, { cause: e });
  }
}
