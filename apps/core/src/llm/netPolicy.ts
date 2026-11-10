/**
 * M5-2 · 内网地址策略 —— isPrivateAddress + assertBaseUrl。
 *
 * 冻结依据：`docs/m35-spec.md` §1.2、`docs/architecture.md` L544-618。
 *
 * 注意：`config/net.ts`（M0-3）已有同逻辑的 M0 版；本文件是 M5 轨道内的独立副本，
 * 以 M5 spec 的签名（`isPrivateAddress(url)` 收 URL、`assertBaseUrl(b: Backend)`）为准。
 * 内网判定用 `ipaddr.js` 的 `range()` 分类，**不手写正则**（spec 硬性要求）。
 */
import net from "node:net";

import { DramaError } from "@text2drama/shared";
import ipaddr from "ipaddr.js";

import type { Backend } from "./backends.js";

/** 视为「本机/内网」的 ipaddr.js range 分类（architecture L589-601 全覆盖） */
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
 * 判断主机名/URL 是否指向本机/内网。
 *
 * spec 签名收的是完整 URL 字符串（`isPrivateAddress(url: string)`）：
 * 能 `new URL` 成功就取 hostname 判，取不出 hostname 的裸主机名也兼容。
 * 域名一律返回 false（不做 DNS 解析，见 config/net.ts 注释里的 TOCTOU 说明）。
 */
export function isPrivateAddress(url: string): boolean {
  let bare: string;
  try {
    bare = new URL(url).hostname;
  } catch {
    // 不是完整 URL → 按裸主机名处理（如 "127.0.0.1"、"localhost"）
    bare = url;
  }
  bare = bare.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (bare === "") return false;
  if (bare === "localhost") return true;

  const version = net.isIP(bare);
  if (version === 0) return false; // 域名（api.deepseek.com 等），不做解析

  const parsed = ipaddr.parse(bare);
  if (version === 6 && parsed instanceof ipaddr.IPv6) {
    // IPv4-mapped（::ffff:a.b.c.d）：取内嵌 IPv4 重判（用 toIPv4Address，
    // 字符串尾巴截取会被 URL 规范化坑——见 config/net.ts 同位置注释）
    if (parsed.range() === "ipv4Mapped") {
      return isPrivateAddress(parsed.toIPv4Address().toString());
    }
  }
  return PRIVATE_RANGES.includes(parsed.range());
}

/**
 * 校验后端地址：协议必须 http/https；私网地址必须显式 `local: true` 才放行，
 * 否则抛 `llm_private_url` (400)。URL 本身非法抛 `invalid_param`。
 */
export function assertBaseUrl(b: Backend): void {
  let u: URL;
  try {
    u = new URL(b.baseUrl);
  } catch (e) {
    throw new DramaError("invalid_param", {
      message: `后端 ${b.id} 的 baseUrl 不是合法 URL：${b.baseUrl}`,
      cause: e,
    });
  }

  // 先查协议（安全默认：不认识的协议直接拒，别先做内网判断）
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new DramaError("invalid_param", {
      message: `后端 ${b.id} 使用了不支持的协议 ${u.protocol}，只允许 http/https`,
    });
  }

  if (isPrivateAddress(u.hostname) && b.local !== true) {
    throw new DramaError("llm_private_url", {
      message:
        `后端 ${b.id} 指向内网地址 ${b.baseUrl}，但未标记为本地后端。` +
        `如果你确实要接本地模型（Ollama/LM Studio），把该后端的 local 设为 true。`,
      hint: `给 id=${b.id} 的后端加 "local": true`,
    });
  }
}
