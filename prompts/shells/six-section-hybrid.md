# Shell · 六段骨架（Hybrid 版，有首帧）

> 本文件由 M3-2 生成，依据：docs/h3-prompt-rules.md §2.1.1（Hybrid 骨架）/§2.5（关键帧写法）/§2.3（枚举）/§1.3（成立条件）；docs/m35-spec.md §2.3。
>
> 适用：`hybrid` —— **关键帧 ≥1 且 参考素材 ≥1**。只给关键帧没有参考素材 = 退化为 I2VA（三字段壳）；只给参考素材没有关键帧 = Ref2VA。点名 Hybrid 但只给一类素材时：说明冲突与代价 → 给两个可执行选项（补素材/降级，壳会变）→ 等确认。

## 骨架（输出格式，正文英文）

```text
subject_definitions:
<Subject 1>: ……人物身份与外观来自 <Picture 1>……
`first_frame`: [Shot 1] 的首帧，取景与构图以此为准。

summary:
[reference generation] ……

retention_analysis:
<Subject 1>（出现在 [Shot 1]）: fully_preserved - ……
`first_frame`: fully_preserved - ……

detailed_description:
目标视频采用真人电影风格，……
[Shot 1] 画面从 `first_frame` 开始，……

overall_soundscape: ……

non_diegetic_music: N/A

No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.
```

## 与纯 Ref2VA 版的两处差异（硬性）

1. **`first_frame` / `last_frame` 加反引号、带下划线**，不加 `<Picture N>` 前缀，**不占 `<Picture N>` 号**。不得写成空格版 `first frame` / `last frame`；不得只写中文「首帧/末帧」而不给字段名；不得自造 `<First Frame>`。工作流节点就是按这两个名字识别的。
2. **`<Picture 1>` 恒为第一张参考图**，不被关键帧挤占；参考图从 1 起按用户给图顺序连续编号，编号总数 = 用户本次给的参考图张数；`<Audio N>` / `<Video N>` 编号同样不被关键帧挤位。

## 编号契约补充

- 关键帧**不被写成 `<Subject N>`**，也不在关键帧行塞声线或性格；关键帧只描述画面事实。
- 身份锚点绑在参考图（`<Picture N>`）上，不绑在关键帧上。
- 挂了尾帧时：最后一个 `[Shot N]` 的末帧**精确落在 `last_frame` 构图**；没挂尾帧时全文**不出现**尾帧描述。
- `[Shot 1]` 必须从 `first_frame` 内部启动（`opens exactly on the first_frame image`），第 0 帧没有换姿势/构图/视线/道具持握；0.00 秒到第一个剧情节拍启动 ≤ 0.5 秒（见 base.md §3.6）。
- 关键帧只能来自用户本次实际上传的图；`<Picture N>` 总数应等于用户本次上传张数。
- 连续链（多参考多片段）：第 1 条 Ref2VA，第 2 条起 Hybrid 接上一条实产尾帧；逐条串行出词，出完一条停下等实产尾帧回交——**猜出来的关键帧比没有更坏**，它会写进 `retention_analysis` 和锚点句，让模型逐像素复现一张不存在的图。

## 枚举值全集

- **视觉保留**：`fully_preserved` / `partially_preserved` / `attribute_transfer` / `weak_reference`
- **音频保留**：`fully_copy` / `partially_copy` / `reference` / `weak_reference`
- **summary 任务类型**：`keyframe completion` / `reference generation` / `video editing` / `video continuation` / `audio reuse` / `audio reference`
- **`audio reuse` 与 `audio reference` 两个都保留**（裁决）：原样搬用波形 → `audio reuse`；只借音色、内容重念 → `audio reference`。判据：**声音内容换不换？**
- `summary` 里音频相关前缀用 `+ audio reference`；`retention_analysis` 里 `<Audio N>` 默认 `reference` 起步。
