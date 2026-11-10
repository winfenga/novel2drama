import { describe, it, expect } from "vitest";
import { escapeXml, renderFcpxml, toFileUrl } from "./fcpxml.js";
import { buildTimeline } from "./timeline.js";
import type { EpisodeTimeline } from "./timeline.js";

/** 24 镜：每镜 5s → 124 帧 @24fps；插帧前总 2976 帧 */
function makeTimeline(interpolateMul = 0, shotCount = 24): EpisodeTimeline {
  const shots = Array.from({ length: shotCount }, (_, i) => ({
    shotId: `s${i + 1}`,
    shotCode: `SC-${String(i + 1).padStart(2, "0")}`,
    sceneCode: "SN-01",
    durationSec: 5,
    videoPath: `video/SC-${String(i + 1).padStart(2, "0")}.mp4`,
  }));
  return buildTimeline({
    episodeId: "ep_01",
    shots,
    lines: [
      {
        dialogueLineId: "d1",
        text: "你终于来了。",
        speakerCode: "CH-01",
        globalStartSec: 1,
        globalEndSec: 2,
        shotId: "s1",
      },
    ],
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 1000,
    interpolateMul,
  });
}

const OPTS = { projectName: "ep01", assetBaseUrl: "D:\\out\\p1\\ep01" };

describe("M10-2 renderFcpxml", () => {
  it("★ 24 镜累加后总帧数精确等于各镜之和，且每镜时长都是分数（不出现小数点）", () => {
    const t = makeTimeline();
    const xml = renderFcpxml(t, OPTS);

    const durations = [...xml.matchAll(/<asset-clip ref="a\d+" offset="\d+\/24s" duration="(\d+)\/24s"/g)].map((m) =>
      Number(m[1]),
    );
    // 视频 clip 24 条（音频那条 lane="-1" 不匹配上面的正则）
    expect(durations).toHaveLength(24);
    expect(durations.every((d) => d === 124)).toBe(true);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(t.totalFrames);
    expect(t.totalFrames).toBe(124 * 24);

    // 每镜 duration 形如 123/24s
    const all = [...xml.matchAll(/duration="([^"]+)"/g)].map((m) => m[1] ?? "");
    for (const d of all) {
      expect(d).toMatch(/^\d+\/\d+s$/);
      expect(d).not.toContain(".");
    }
    // frameDuration 单独一条，也是分数
    expect(xml).toContain('frameDuration="100/2400s"');
  });

  it("★ offset 严格累加：第 N 镜 offset = 前面所有 duration 之和，无空隙无重叠", () => {
    const t = makeTimeline();
    const xml = renderFcpxml(t, OPTS);
    const offsets = [...xml.matchAll(/<asset-clip ref="a\d+" offset="(\d+)\/24s"/g)].map((m) => Number(m[1]));
    expect(offsets.slice(0, 24)).toEqual(
      Array.from({ length: 24 }, (_, i) => i * 124),
    );
  });

  it("★ 音频只有一条 asset-clip，lane=\"-1\"，duration = 总时长", () => {
    const t = makeTimeline();
    const xml = renderFcpxml(t, OPTS);

    const audioClips = [...xml.matchAll(/<asset-clip [^>]*lane="-1"[^>]*\/>/g)];
    expect(audioClips).toHaveLength(1);
    expect(audioClips[0]?.[0]).toContain(`ref="a${t.shots.length + 1}"`);
    expect(audioClips[0]?.[0]).toContain(`offset="0/24s"`);
    expect(audioClips[0]?.[0]).toContain(`duration="${t.totalFrames}/24s"`);

    // 音频 asset 也该只有一条，且 hasAudio
    const audioAssets = [...xml.matchAll(/<asset [^>]*hasAudio="1"[^>]*\/>/g)];
    expect(audioAssets).toHaveLength(1);
    expect(audioAssets[0]?.[0]).toContain(`duration="${t.totalFrames}/24s"`);
  });

  it("★ mul=2 时 frameDuration=100/4800s，且所有时长分母为 48", () => {
    const t = makeTimeline(2, 4);
    const xml = renderFcpxml(t, OPTS);

    expect(xml).toContain('frameDuration="100/4800s"');
    expect(t.fps).toBe(48);

    const dens = [...xml.matchAll(/(?:duration|offset)="\d+\/(\d+)s"/g)].map((m) => Number(m[1]));
    expect(dens.length).toBeGreaterThan(0);
    expect(new Set(dens)).toEqual(new Set([48]));

    const shotDurs = [...xml.matchAll(/<asset-clip ref="a\d+" offset="\d+\/48s" duration="(\d+)\/48s"/g)].map((m) =>
      Number(m[1]),
    );
    expect(shotDurs.every((d) => d === 248)).toBe(true);
    expect(t.totalFrames).toBe(248 * 4);
  });

  it("mul=4 时 frameDuration=100/9600s（96fps）", () => {
    const t = makeTimeline(4, 2);
    const xml = renderFcpxml(t, OPTS);
    expect(t.fps).toBe(96);
    expect(xml).toContain('frameDuration="100/9600s"');
    const dens = new Set([...xml.matchAll(/(?:duration|offset)="\d+\/(\d+)s"/g)].map((m) => Number(m[1])));
    expect(dens).toEqual(new Set([96]));
  });

  it("sequence 的 duration 与末镜 end 对齐（tcStart=0）", () => {
    const t = makeTimeline();
    const xml = renderFcpxml(t, OPTS);
    expect(xml).toContain(`<sequence format="r1" duration="${t.totalFrames}/24s" tcStart="0s">`);
  });

  it("XML 转义：名称里的 & < > \" ' 全部转义", () => {
    const t = makeTimeline(0, 1);
    const xml = renderFcpxml(t, { projectName: `a&b<c>d"e'f`, assetBaseUrl: "D:\\x" });
    expect(xml).toContain("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    expect(xml).not.toContain("<c>");
  });

  it("Windows 路径转成 file:///D:/... 形式", () => {
    expect(toFileUrl("D:\\out\\p1\\ep01")).toBe("file:///D:/out/p1/ep01");
    expect(toFileUrl("D:/out/p1")).toBe("file:///D:/out/p1");
    expect(toFileUrl("file:///D:/already")).toBe("file:///D:/already");
    expect(toFileUrl("\\\\server\\share\\x")).toBe("file://server/share/x");
    expect(toFileUrl("/posix/x y")).toBe("file:///posix/x%20y");
  });

  it("素材根与相对 videoPath 拼接后出现在 asset src 里（file URL）", () => {
    const t = makeTimeline(0, 2);
    const xml = renderFcpxml(t, OPTS);
    expect(xml).toContain('src="file:///D:/out/p1/ep01/video/SC-01.mp4"');
    expect(xml).toContain('src="file:///D:/out/p1/ep01/audio/ep01_voice.wav"');
    // 不出现双斜杠（除 file:// 本身）
    expect(xml).not.toContain("ep01//");
  });

  it("escapeXml 覆盖五实体", () => {
    expect(escapeXml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&apos;");
    expect(escapeXml("普通中文")).toBe("普通中文");
  });
});
