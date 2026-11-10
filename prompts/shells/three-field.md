# Shell · 三字段壳（T2VA / I2VA / L2VA / FL2VA）

> 本文件由 M3-3 生成，依据：docs/h3-prompt-rules.md §2.2（三字段壳）/§2.3（枚举）；docs/m35-spec.md §2.3；EX01 §六（I2VA 硬性格式）。
>
> 适用：`t2va` / `i2va` / `l2va` / `fl2va`。**指令行 i2va 有、t2va 无**；l2va/fl2va 是 Ref2VA 挂关键帧锚点的变体，锚点行写法见编号契约。

## 骨架（输出格式，正文英文）

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

## 指令行规则

- **第一行是指令行：I2VA 有，T2VA 没有。** 指令行之后空一行，再写字段。
- I2VA 的指令行固定写法**逐字使用**：`For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
- 「在 0.00 秒时 `<Picture 1>` 被完整参考」是 I2VA 的固定写法。
- I2VA 的唯一输入图片即 `<Picture 1>`，是视频 0.00 秒的实际首帧，归属于 `[Shot 1]`；正文首次锁定人物时以 `the … shown in <Picture 1>` 句式建立绑定。
- T2VA：无任何视觉素材，正文里**不得出现任何参考标签**（`<Picture N>` / `<Audio N>` / `<Video N>` / `<Subject N>`）。

## 三个固定字段（名称、顺序固定，不可增删改名）

- **integrated_multimodal_description**：主体。沿时间线描述画面、动作、镜头、说话人、台词与同期声。
- **overall_soundscape**：1–4 句英文，概括环境声、动作声、非语言人声；台词与唱词属主体字段，此处不重复；仅当用户明确要求全片无声才写 `N/A`。
- **non_diegetic_music**：1–3 句英文，只写乐器、速度、节奏、力度变化，禁止抽象情绪词；无配乐写 `N/A`。
- 技术排除行 `No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.` 附在最后（`non_diegetic_music` 之后）。

## 编号契约补充

- `l2va`（末帧锚定）/ `fl2va`（首帧+末帧）在三字段壳上叠加锚点行：末帧用 `` `last_frame` ``、首末帧用 `` `first_frame` `` ＋ `` `last_frame` ``（反引号字段名，不占 `<Picture N>` 号，同 six-section-hybrid.md 的字段名纪律）；挂了尾帧则最后一个 `[Shot N]` 末帧精确落在 `last_frame`。
- 锚定首帧条目开场 0.5 秒内第一个剧情节拍已启动（base.md §3.6，硬性）。
- 素材带了音频或视频参考时不允许走本壳（I2VA/T2VA 无 `<Audio N>`/`<Video N>` 位置）——改走 Ref2VA 或 Hybrid，明确报错引导，不静默降级。

## 枚举值全集

- **视觉保留**：`fully_preserved` / `partially_preserved` / `attribute_transfer` / `weak_reference`
- **音频保留**：`fully_copy` / `partially_copy` / `reference` / `weak_reference`
- **summary 任务类型**：`keyframe completion` / `reference generation` / `video editing` / `video continuation` / `audio reuse` / `audio reference`
- **`audio reuse` 与 `audio reference` 两个都保留**（裁决）：原样搬用波形 → `audio reuse`；只借音色、内容重念 → `audio reference`。判据：**声音内容换不换？**
- I2VA 的 `summary` 用 `[keyframe completion]`；T2VA 无参考语义，`summary` 前缀按内容选 `keyframe completion`。
