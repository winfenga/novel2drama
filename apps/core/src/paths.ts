/**
 * 路径解析 —— 数据根目录与派生路径的唯一来源。
 *
 * 依据 `docs/m0-spec.md` §3、§5.9、§9 漂移 D9：
 * - 数据根目录 `~/.text2drama`，`DRAMA_HOME` 可覆盖
 * - 旧目录 `~/.novel2drama` 仅作**只读回退**：读旧、写新，不搬文件、不改旧目录内容
 *
 * ⚠️ 读写路径必须分开暴露（2026-11-10 由主会话修订 §5.9 签名）：
 * 本模块只提供两条路径，**不做任何 fallback 决策**——
 * - `configFile` 恒为写路径（新 home 下），绝不因旧文件存在而指向旧目录；
 * - `legacyConfigFile` 恒为历史遗留位置（旧 home 下），可能不存在。
 * 回退逻辑（新配置读不到时是否改读旧配置）由 `loadConfig` 负责，
 * 因为只有它知道一个 `null`/`ENOENT` 在业务上意味着什么。
 * paths 里若替它做决定，`saveConfig` 拿到被回退过的路径就会把配置写回旧目录。
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DramaPaths {
  /** 数据根目录（新），一切写操作的落点 */
  home: string;
  /** 配置文件写路径，恒为 `join(home, "config.json")`，**不做 fallback** */
  configFile: string;
  /** 旧目录下的配置文件，只读回退用，可能不存在 */
  legacyConfigFile: string;
  /** 审计日志目录，恒为新 home 下 */
  logDir: string;
  /** 业务数据目录，恒为新 home 下 */
  dataDir: string;
}

/** 新数据目录名（产品名 text2drama） */
const HOME_DIR_NAME = ".text2drama";
/** 旧数据目录名，仅作只读回退 */
const LEGACY_HOME_DIR_NAME = ".novel2drama";
/** 配置文件基名 */
const CONFIG_FILE_NAME = "config.json";

/**
 * 取用户主目录。显式传 env 时优先用其中的 HOME / USERPROFILE，
 * 便于测试注入；都没给才退回 `os.homedir()`。
 */
function userHome(env: NodeJS.ProcessEnv): string {
  const candidate = env.HOME ?? env.USERPROFILE;
  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }
  return homedir();
}

/**
 * 解析全部运行时路径。**不创建目录、不写文件、不探存在性** —— 纯函数。
 */
export function resolvePaths(env: NodeJS.ProcessEnv = process.env): DramaPaths {
  const homeBase = userHome(env);

  const overrideHome = env.DRAMA_HOME;
  const home =
    typeof overrideHome === "string" && overrideHome.trim().length > 0
      ? resolve(overrideHome)
      : join(homeBase, HOME_DIR_NAME);

  return {
    home,
    // 写路径：恒为新 home，不受旧目录存在与否影响
    configFile: join(home, CONFIG_FILE_NAME),
    // 只读回退：恒为历史遗留位置。故意不受 DRAMA_HOME 影响——
    // 它探的是产品改名前的固定位置，用户设了 DRAMA_HOME 也改变不了那段历史。
    legacyConfigFile: join(homeBase, LEGACY_HOME_DIR_NAME, CONFIG_FILE_NAME),
    logDir: join(home, "logs"),
    dataDir: join(home, "data"),
  };
}
