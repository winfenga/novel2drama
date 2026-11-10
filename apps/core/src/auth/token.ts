/**
 * 常量时间字符串比较。
 *
 * 冻结签名：`docs/m0-spec.md` §5.11。
 */
import { timingSafeEqual } from "node:crypto";

/**
 * 长度不等直接 `false`（`crypto.timingSafeEqual` 对不等长会抛错）。
 *
 * 长度本身会泄漏一位信息量级，但 token 是本地随机 36 hex，
 * 不构成可利用的时序侧信道；这里不做填充比较，保持实现简单。
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
