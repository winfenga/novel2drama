/**
 * M8-4 · 取消能力。
 *
 * 冻结依据：`docs/m489-spec.md` §2.2（api-contract L488-489：POST /api/tasks/:id/cancel 幂等）。
 *
 * 动作序列（architecture L1879）：
 * 1. 排队中的任务：queue.cancelQueued 移出（尚未提交 ComfyUI，无需远端动作）
 * 2. 已提交 ComfyUI 的任务：queue delete（出队）+ interrupt（打断执行中）+ abort 轮询
 * 3. 幂等：重复取消（任务不存在 / 已取消 / 已完成）返成功不抛（api L488-489「幂等」）
 *
 * 调用方通过 `markSubmitted` 告知 taskId ↔ promptId 映射；未 markSubmitted 的取消
 * 只做本地移除（映射不存在时远端动作跳过——这不算吞错，是正常生命周期）。
 */

import type { createComfyClient } from "./client.js";
import type { createQueue } from "./queue.js";

type ComfyClient = ReturnType<typeof createComfyClient>;
type Queue = ReturnType<typeof createQueue>;

export interface CancelDeps {
  /** taskId → promptId 映射存取（任务提交成功后由调用方 mark） */
  getPromptId(taskId: string): string | undefined;
  /** abort 轮询停止钩子（client.watch 返回的 unwatch） */
  unwatch(taskId: string): void;
}

export function createCancelCapability(
  client: ComfyClient,
  queue: Queue,
  deps: CancelDeps,
): { cancel(taskId: string): Promise<void> } {
  /** 已发起过取消的任务——幂等记忆 */
  const canceled = new Set<string>();

  return {
    async cancel(taskId: string): Promise<void> {
      // 幂等：重复取消直接返成功，不抛
      if (canceled.has(taskId)) return;
      canceled.add(taskId);

      // ① 本地队列：还在排队的直接移出
      queue.cancelQueued(taskId);

      // ② 停止心跳轮询（abort 轮询）
      deps.unwatch(taskId);

      // ③ 远端：queue delete + interrupt（有映射才做；无映射=任务还没提交，本地清除即完成）
      const promptId = deps.getPromptId(taskId);
      if (promptId === undefined) return;
      await client.deleteFromQueue(promptId);
      await client.interrupt();
    },
  };
}
