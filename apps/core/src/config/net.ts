/**
 * 地址安全判定 —— 区分「用户主动配的本地后端」与「被诱导打内网」。
 *
 * 冻结依据：`docs/architecture.md` L544-618（`assertBaseUrl` / `isPrivateAddress` 原稿）、
 * `docs/m0-spec.md` §5.10（文件归 M0-3）。
 *
 * 策略（architecture L549-562）：
 * - 显式 `local: true` 才允许 loopback / 私网 —— 不靠地址猜
 * - 协议白名单先判（不认识的协议直接拒，别先做内网判断）
 * - 内网判定用 `ipaddr.js` 的 `range()` 分类，**不手写正则**
 */
import net from "node:net";

import { DramaError } from "@text2drama/shared";
import ipaddr from "ipaddr.js";

import type { LlmBackend } from "./types.js";

/** 视为「本机/内网」的 `ipaddr.js` range 分类 */
const PRIVATE_RANGES: readonly string[] = [
  "loopback", // 127.0.0.0/8, ::1
  "private", // 10/8, 172.16/12, 192.168/16
  "linkLocal", // 169.254/16（APIPA）, fe80::/10
  "uniqueLocal", // fc00::/7
  "carrierGradeNat", // 100.64/10（云内网）
  "unspecified", // 0.0.0.0/8, ::
  "reserved", // 240/4 等保留段
];

/**
 * 判断主机名是否指向本机/内网。
 *
 * 覆盖 `architecture.md` L589-601 列的每一条，包括原稿正则漏掉的
 * linkLocal / carrierGradeNat / unspecified，以及 IPv4-mapped IPv6。
 *
 * 域名（`api.deepseek.com` 之类）一律返回 `false` —— 这里**不做 DNS 解析**：
 * 解析会引入 TOCTOU（判定与真正连接之间可被重绑定），也会让纯函数变慢变不可测。
 * 真要做 DNS 层防护属于 M1 调用链的事，M0 只判字面量。
 */
export function isPrivateAddress(hostname: string): boolean {
  // new URL 会把 IPv6 包在 [] 里，先剥掉；主机名大小写不敏感
  const bare = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (bare === "") return false;
  if (bare === "localhost") return true;

  const version = net.isIP(bare);
  if (version === 0) return false; // 域名，交给上层协议/证书去兜

  // 用 instanceof 窄化：`kind()` 只是运行时判断，TS 不据此收窄 `IPv4 | IPv6` 联合
  const parsed = ipaddr.parse(bare);
  if (version === 6 && parsed instanceof ipaddr.IPv6) {
    /**
     * IPv4-mapped（`::ffff:a.b.c.d`）取出内嵌 IPv4 重判。
     *
     * 用 `range() === "ipv4Mapped"` + `toIPv4Address()` 而不是原稿的
     * `bare.split(":").pop()`：WHATWG URL 会把 `::ffff:127.0.0.1`
     * 规范化成 `[::ffff:7f00:1]`，此时字符串尾巴是 "1"，
     * 按字符串取内嵌地址会判成公网 —— 127.0.0.1 就此漏网。
     * `toIPv4Address()` 对点分和十六进制两种写法都能正确还原。
     */
    if (parsed.range() === "ipv4Mapped") {
      return isPrivateAddress(parsed.toIPv4Address().toString());
    }
    return PRIVATE_RANGES.includes(parsed.range());
  }

  return PRIVATE_RANGES.includes(parsed.range());
}

/**
 * 校验后端地址：协议必须是 http/https；私网地址必须显式 `local: true`。
 *
 * 抛 `invalid_param`（协议/URL 本身非法）或 `llm_private_url`（内网但没标本地）。
 */
export function assertBaseUrl(backend: LlmBackend): void {
  let url: URL;
  try {
    url = new URL(backend.baseUrl);
  } catch (e) {
    throw new DramaError("invalid_param", {
      message: `后端 ${backend.id} 的 baseUrl 不是合法 URL：${backend.baseUrl}`,
      cause: e,
    });
  }

  // 先查协议：安全默认，不认识的协议直接拒，别先做内网判断
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DramaError("invalid_param", {
      message: `后端 ${backend.id} 使用了不支持的协议 ${url.protocol}，只允许 http/https`,
    });
  }

  if (isPrivateAddress(url.hostname) && backend.local !== true) {
    throw new DramaError("llm_private_url", {
      message:
        `后端 ${backend.id} 指向内网地址 ${backend.baseUrl}，但未标记为本地后端。` +
        `如果你确实要接本地模型（Ollama/LM Studio），把该后端的 local 设为 true。`,
      hint: `PUT /api/config 里给 id=${backend.id} 的后端加 "local": true`,
    });
  }
}
