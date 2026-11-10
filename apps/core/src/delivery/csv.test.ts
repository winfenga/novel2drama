import { describe, it, expect } from "vitest";
import { DramaError } from "@text2drama/shared";
import { CSV_COLUMNS, escapeCsvField, renderCsv, UTF8_BOM } from "./csv.js";
import { buildTimeline } from "./timeline.js";

function tl(opts?: { dialogue?: string; durationSec?: number; taskType?: "ref2va" | "hybrid" }) {
  return buildTimeline({
    episodeId: "ep_01",
    shots: [
      {
        shotId: "s1",
        shotCode: "SC-01",
        sceneCode: "SN-01",
        durationSec: opts?.durationSec ?? 5,
        videoPath: "video/SC-01.mp4",
        ...(opts?.taskType === undefined ? {} : { taskType: opts.taskType }),
      },
      {
        shotId: "s2",
        shotCode: "SC-02",
        sceneCode: "SN-01",
        durationSec: 10,
        videoPath: "video/SC-02.mp4",
        taskType: "hybrid",
      },
    ],
    lines: [
      {
        dialogueLineId: "d1",
        text: opts?.dialogue ?? "你终于来了。",
        speakerCode: "CH-01",
        globalStartSec: 1.2,
        globalEndSec: 4.35,
        shotId: "s1",
      },
    ],
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 100,
    interpolateMul: 0,
  });
}

/** 极简 RFC4180 行切分（只用于测试，够验引号与逗号） */
function parseCsvLine(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (inQuote) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuote = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

describe("M10-4 renderCsv", () => {
  it("★ 首字符是 UTF-8 BOM", () => {
    const csv = renderCsv(tl());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    // BOM 在 UTF-8 里是 3 字节
    expect(Buffer.byteLength(UTF8_BOM, "utf8")).toBe(3);
  });

  it("列顺序固定，表头逐字一致（契约文字写「14 列」但只列出 13 个名字，以字面清单为准）", () => {
    const csv = renderCsv(tl());
    const header = csv.slice(1).split("\r\n")[0];
    expect(header).toBe(
      "shotId,shotCode,sceneCode,startSec,endSec,durationSec,videoFile,dialogue,dialogueStartSec,dialogueEndSec,voicedBy,taskType,chainSegment",
    );
    expect(CSV_COLUMNS).toHaveLength(13);
    expect(parseCsvLine(header ?? "")).toHaveLength(13);
  });

  it("★ 含逗号的台词被引号包裹（RFC4180）", () => {
    const csv = renderCsv(tl({ dialogue: "你来了,我等了很久。" }));
    expect(csv).toContain('"你来了,我等了很久。"');
    // 解析回来台词完整
    const rows = csv.slice(1).trimEnd().split("\r\n");
    const first = parseCsvLine(rows[1] ?? "");
    expect(first[7]).toBe("你来了,我等了很久。");
  });

  it("含双引号的台词双写引号", () => {
    const csv = renderCsv(tl({ dialogue: '他说"别走"。' }));
    expect(csv).toContain('"他说""别走""。"');
    const first = parseCsvLine(csv.slice(1).trimEnd().split("\r\n")[1] ?? "");
    expect(first[7]).toBe('他说"别走"。');
  });

  it("含换行的台词整段加引号", () => {
    const csv = renderCsv(tl({ dialogue: "第一行\n第二行" }));
    expect(csv).toContain('"第一行\n第二行"');
  });

  it("startSec / endSec / durationSec 都是三位小数", () => {
    const csv = renderCsv(tl());
    const rows = csv.slice(1).trimEnd().split("\r\n");
    const first = parseCsvLine(rows[1] ?? "");
    expect(first[3]).toMatch(/^\d+\.\d{3}$/);
    expect(first[4]).toMatch(/^\d+\.\d{3}$/);
    expect(first[5]).toMatch(/^\d+\.\d{3}$/);
    // 124 帧 / 24 = 5.1667 → 5.167
    expect(first[3]).toBe("0.000");
    expect(first[4]).toBe("5.167");
    expect(first[5]).toBe("5.167");
  });

  it("taskType 小写；拿不到就留空（不猜默认值）", () => {
    const csv = renderCsv(tl({ taskType: "ref2va" }));
    const rows = csv.slice(1).trimEnd().split("\r\n");
    expect(parseCsvLine(rows[1] ?? "")[11]).toBe("ref2va");
    expect(parseCsvLine(rows[2] ?? "")[11]).toBe("hybrid");
    // 完全没有 taskType 的镜
    const noType = buildTimeline({
      episodeId: "ep_01",
      shots: [
        { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4" },
      ],
      lines: [],
      audioPath: "audio/a.wav",
      audioDurationSec: 100,
      interpolateMul: 0,
    });
    const csv2 = renderCsv(noType);
    expect(parseCsvLine(csv2.slice(1).trimEnd().split("\r\n")[1] ?? "")[11]).toBe("");
  });

  it("chainSegment 单段恒填 1；videoFile 只取 basename", () => {
    const csv = renderCsv(tl());
    const rows = csv.slice(1).trimEnd().split("\r\n");
    expect(parseCsvLine(rows[1] ?? "")[12]).toBe("1");
    expect(parseCsvLine(rows[1] ?? "")[6]).toBe("SC-01.mp4");
    expect(parseCsvLine(rows[1] ?? "")[6]).not.toContain("video/");
  });

  it("纯空镜没有台词：dialogue 与起止时间留空，不填 0.000 占位", () => {
    const t = buildTimeline({
      episodeId: "ep_01",
      shots: [
        { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4" },
        { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-02.mp4" },
      ],
      lines: [
        { dialogueLineId: "d1", text: "第一镜有词。", speakerCode: "CH-01", globalStartSec: 1, globalEndSec: 2 },
      ],
      audioPath: "audio/a.wav",
      audioDurationSec: 100,
      interpolateMul: 0,
    });
    const rows = renderCsv(t).slice(1).trimEnd().split("\r\n");
    const second = parseCsvLine(rows[2] ?? "");
    expect(second[7]).toBe("");
    expect(second[8]).toBe("");
    expect(second[9]).toBe("");
    expect(second[10]).toBe("");
  });

  it("每行都是 13 列（含逗号/引号/换行也不错位）", () => {
    const t = buildTimeline({
      episodeId: "ep_01",
      shots: [
        { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4" },
        { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-02.mp4" },
      ],
      lines: [
        { dialogueLineId: "d1", text: "逗号,引号\"换行\n都在一起。", speakerCode: "CH-01", globalStartSec: 1, globalEndSec: 2 },
      ],
      audioPath: "a.wav",
      audioDurationSec: 100,
      interpolateMul: 0,
    });
    const csv = renderCsv(t);
    const rows = csv.slice(1).trimEnd().split("\r\n");
    // 含换行的字段会让「按行切」多出一行，这是 RFC4180 允许的；
    // 用解析器逐行合并验证列数
    const parsed: string[][] = [];
    let pending = "";
    for (const row of rows) {
      const candidate = pending === "" ? row : `${pending}\n${row}`;
      const fields = parseCsvLine(candidate);
      if (candidate.split('"').length % 2 === 1) {
        parsed.push(fields);
        pending = "";
      } else {
        pending = candidate;
      }
    }
    expect(parsed).toHaveLength(3);
    for (const p of parsed) expect(p).toHaveLength(13);
  });

  it("escapeCsvField：无需转义的原样返回，含特殊字符的加引号", () => {
    expect(escapeCsvField("普通文本")).toBe("普通文本");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
    expect(escapeCsvField(" 前后有空格 ")).toBe('" 前后有空格 "');
  });

  it("零镜头 → 抛 delivery_incomplete", () => {
    // buildTimeline 本身就会因 no_shots 抛；这里手工构造空时间轴验证 renderCsv 自己的防线
    expect(() =>
      renderCsv({
        episodeId: "ep_01",
        fps: 24,
        interpolateMul: 0,
        totalDurationSec: 0,
        totalFrames: 0,
        shots: [],
        lines: [],
        audioPath: "a.wav",
      }),
    ).toThrow(DramaError);
  });

  it("缺音轨 → 抛 delivery_incomplete（不出无声数据表）", () => {
    expect(() =>
      renderCsv({
        episodeId: "ep_01",
        fps: 24,
        interpolateMul: 0,
        totalDurationSec: 5,
        totalFrames: 124,
        shots: [
          {
            shotId: "s1",
            shotCode: "SC-01",
            sceneCode: "SN-01",
            startSec: 0,
            endSec: 124 / 24,
            durationFrames: 124,
            videoPath: "video/SC-01.mp4",
          },
        ],
        lines: [],
        audioPath: "",
      }),
    ).toThrow(DramaError);
  });
});
