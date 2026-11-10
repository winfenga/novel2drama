/**
 * M9-4 · 按文本片段切音频（spec §3.2 / DEC §6B）。
 *
 * 冻结语义：分镜锁定的是**文本片段（子串，表示法 B：存文本不存区间）**——
 * 上游（分镜流程）已用 locateSpan 把每镜片段定位成区间，本函数消费区间做纯切分校验：
 * - 返回每镜 startSec/endSec；区间非法（重叠/越界/倒挂）→ 报错不猜
 * - 相邻镜之间的间隙归属：切分点取两镜交界（前一镜 endSec == 后一镜 startSec 的来源是
 *   locateSpan 的字级边界，天然不重叠；本函数只做机械校验，不做模糊并集）
 */
import { DramaError } from "@text2drama/shared";

export interface ShotSpan {
  shotId: string;
  text: string;
  startSec: number;
  endSec: number;
}

export interface ShotCut {
  shotId: string;
  startSec: number;
  endSec: number;
}

/**
 * 按分镜锁定的片段区间切整段台词音频。
 * @throws DramaError invalid_param：
 *   - endSec <= startSec（倒挂/零长）
 *   - 越界（<0 或 > fullAudioSec）
 *   - 两镜区间重叠（分镜片段在原文里交叠 = 上游 bug，不许静默去重）
 */
export function splitDialogueAudio(
  fullAudioSec: number,
  spans: ShotSpan[],
): ShotCut[] {
  if (spans.length === 0) {
    throw new DramaError("invalid_param", { message: "spans 不能为空（没有分镜片段可切）" });
  }
  const cuts: ShotCut[] = [];
  const sorted = [...spans].sort((a, b) => a.startSec - b.startSec);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (s.endSec <= s.startSec) {
      throw new DramaError("invalid_param", {
        message: `分镜 ${s.shotId} 区间倒挂/零长：[${s.startSec}, ${s.endSec}]`,
        details: { shotId: s.shotId, text: s.text },
      });
    }
    if (s.startSec < 0 || s.endSec > fullAudioSec) {
      throw new DramaError("invalid_param", {
        message: `分镜 ${s.shotId} 区间越界：[${s.startSec}, ${s.endSec}] 超出音频时长 ${fullAudioSec}s`,
        details: { shotId: s.shotId, fullAudioSec },
      });
    }
    const prev = cuts[cuts.length - 1];
    if (prev !== undefined && s.startSec < prev.endSec) {
      throw new DramaError("invalid_param", {
        message: `分镜 ${s.shotId} 与 ${prev.shotId} 区间重叠（片段在原文里交叠，上游分镜 bug）`,
        details: { a: prev, b: s },
      });
    }
    cuts.push({ shotId: s.shotId, startSec: s.startSec, endSec: s.endSec });
  }
  return cuts;
}
