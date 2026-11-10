# Shell · 六段骨架（Ref2VA 纯参考版）

> 本文件由 M3-2 生成，依据：docs/h3-prompt-rules.md §2.1（纯 Ref2VA 骨架）/§2.3（枚举）/§2.4（`<Picture N>` 单独定义条件）/§四（Audio/Video 编号纪律）；docs/m35-spec.md §2.3。
>
> 适用：`ref2va` —— 有参考素材、**无关键帧**。`<Picture 2>` 是第二张参考图，不是首帧。
> **Hybrid 场景（有首帧）不要照抄本编号**——见 six-section-hybrid.md。混用会导致 `<Picture 1>` 指向错误素材。
> 字段名与顺序不得变动。

## 骨架（输出格式，正文英文）

```text
subject_definitions:
<Subject 1>: ……人物身份与外观来自 <Picture 1>……
<Picture 2>: [Shot 1] 的第二张参考图（无关键帧，此处不写首帧）……

summary:
[reference generation] ……

retention_analysis:
<Subject 1>（出现在 [Shot 1]）: fully_preserved - ……
<Picture 2>（[Shot 1] 参考图）: fully_preserved - ……

detailed_description:
目标视频采用真人电影风格，……
[Shot 1] 画面从 <Picture 1> 开始，……

overall_soundscape: ……

non_diegetic_music: N/A

No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.
```

## 编号契约

- 参考图 `<Picture N>` 从 1 起、按用户给图顺序连续编号；编号总数 = 用户本次给图张数。
- **`<Picture N>` 只在它作为首帧、关键帧、末帧或分镜锚点时才单独定义**；纯粹提供人物或服装的图挂在 `<Subject N>` 名下，不单独成行。只有一张纯人物参考图时：`<Subject 1> is the adult woman whose face and black updo come from <Picture 1>.`，`summary` 用 `[reference generation]`，`retention_analysis` 只评估 `<Subject 1>`。
- `<Video N>` 与 `<Audio N>` 各自独立编号，编号不编码两者的配对关系；参考视频不会因为「文件里有声音」就自动产生 `<Audio N>`；`(Sx)` 按实际发声顺序分配一次，`<Audio N>` 的定义复用该 ID。`<Audio N>` 最多 3 条，每条 2–15 秒。

## 枚举值全集

- **视觉保留**（`retention_analysis` 中 `<Picture N>` / `<Subject N>`）：`fully_preserved` / `partially_preserved` / `attribute_transfer` / `weak_reference`
- **音频保留**（`retention_analysis` 中 `<Audio N>` 单独一行）：`fully_copy` / `partially_copy` / `reference` / `weak_reference`
- **summary 任务类型**：`keyframe completion` / `reference generation` / `video editing` / `video continuation` / `audio reuse` / `audio reference`
- **`audio reuse` 与 `audio reference` 两个都保留**（裁决，不是只留一个）：原样搬用音频波形（台词剧本原句不改）→ `audio reuse`；只借音色特征、内容重念 → `audio reference`。判据一句话：**声音内容换不换？**
- `summary` 里音频相关前缀用 `+ audio reference`；`retention_analysis` 里 `<Audio N>` 默认 `reference` 起步。
