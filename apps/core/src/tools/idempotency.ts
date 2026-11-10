/**
 * M0-7 · 幂等缓存
 *
 * 依据 `docs/m0-spec.md` §5.5（冻结签名）与 `docs/mcp-tools.md` L501-519。
 * 进程内 Map 实现，单进程够用；多实例要换 SQLite 表（`requestId PK, result JSON, createdAt`）。
 *
 * 语义（照着写，别加戏）：
 * - `key` 为空 → 直接执行，不缓存
 * - 命中且未过期 → 返回**同一份 result 引用**，不深拷贝
 * - 只缓存**成功**结果；抛错的不缓存
 * - `maxEntries` 默认 1000，超了按 `at` 升序淘汰最旧
 */

export interface IdempotencyOptions {
  ttlMs?: number;
  now?: () => number;
  maxEntries?: number;
}

interface CacheEntry {
  at: number;
  result: unknown;
}

/** api-contract.md §6.2：TTL 10 分钟 */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 1000;

const cache = new Map<string, CacheEntry>();

/** 测试用：清空缓存 */
export function resetIdempotencyCache(): void {
  cache.clear();
}

/**
 * 清过期 + 按 at 升序淘汰到 maxEntries 以内。
 * 过期清理顺带防止「没人再调用 key」的条目永久占内存。
 */
function evict(limit: number, ttlMs: number, now: () => number): void {
  if (Number.isFinite(ttlMs)) {
    const t = now();
    for (const [k, v] of cache) {
      if (t - v.at >= ttlMs) cache.delete(k);
    }
  }
  const max = Math.max(0, Math.floor(limit));
  while (cache.size > max) {
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [k, v] of cache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export async function withIdempotency<T>(
  key: string | undefined,
  fn: () => Promise<T>,
  opts?: IdempotencyOptions,
): Promise<T> {
  // 空 key（undefined 或 ""）视为「不参与幂等」，直接执行
  if (key === undefined || key === "") {
    return fn();
  }

  const now: () => number = opts?.now ?? (() => Date.now());
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const hit = cache.get(key);
  if (hit !== undefined) {
    if (now() - hit.at < ttlMs) {
      // 刻意不深拷贝：命中即返回同一份引用（调用方若改动结果，缓存也会跟着变，这是约定）
      return hit.result as T;
    }
    cache.delete(key);
  }

  // 异常直接往上抛，不落缓存 —— 失败的操作必须允许重试
  const result = await fn();

  cache.set(key, { at: now(), result });
  evict(maxEntries, ttlMs, now);
  return result;
}
