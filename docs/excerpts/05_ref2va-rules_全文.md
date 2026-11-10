<!-- 摘录自 references\ref2va-rules.md  L1-L179 ｜ 六段壳正式定义 -->

# MiniMax H3 Ref2VA 单/多参考（图／音频／视频）成人向规则

> **路线边界（先读）：** 本篇覆盖**纯参考** —— 没有任何一张图被指认为目标视频的关键帧。
> **若用户明确指认了 0.00 秒首帧或末帧，同时又另有参考素材 → 那是 `Hybrid` 分支**：六段壳、标签体系、枚举值、第 3.5 节多参规则、第 6 节自检**全部照本篇**，但 **关键帧的标识方式改用 `hybrid-rules.md`** —— 关键帧用字段名 `first_frame` / `last_frame` 独立标识、**不占 `<Picture N>` 号**，`<Picture N>` 从 `<Picture 1>` 起只排参考图，**与本篇"第一张参考图就是 `<Picture 1>`"的直觉一致**。动笔前先确认走哪条。
>
> **★ 多参考连续链（硬性 · 2026-10-03 用户指定）：选用多参考产出多条片段时，本篇只管第 1 条。** 第 1 条无前序可接 → 走 Ref2VA；**第 2 条起一律改走 `Hybrid`**，把上一条的实产尾帧接成本条 `first_frame`。理由是**本技能照剧本生成提示词，首要保持连贯** —— 纯 Ref2VA 每条独立生成、不接帧，姿势／朝向／位置／光线会漂，成片会跳。细则见 `hybrid-rules.md` 第 1 节；冲突处理见 `SKILL.md` E1 前置铁律。

## 1. 输入与归因

> 音频参考（`<Audio N>`）与视频参考（`<Video N>`）的完整规则见第 3.5 节。

支持一张或多张参考图。先逐张提取可见事实：人物及成人性、发型与面部特征、服装、身体姿态、环境、光线、机位三要素、道具、可见文字。为每张图标注一个或多个实际角色：

- **关键帧**：视频首帧、指定中间关键帧或末帧。
- **人物主体**：身份、脸、身形、发型、配饰。
- **服装/道具**：指定的衣物、物件、可见材质或图案。
- **场景/构图**：空间、光线、镜头位置、画面布局或分镜规划。
- **动作/姿态**：一个具体可迁移的姿态或动作阶段。

用户的明确分工优先。没有指定时，以首帧/关键帧锚定的构图优先，再以每张图实际可见的归因决定；不要把不同人物混成同一个人，也不要把某张图的衣服、场景或道具无理由带到另一张图。

单张人物设定图本身就是有效的 Ref2VA 输入。若它只负责身份与外观，将其写入 `<Subject 1>` 的来源归因，并用 `[reference generation]` 生成新的镜头、动作与场景；不得因为只有一张图就改走 I2VA，也不得把纯人设图虚构成首帧。首帧/关键帧锚点不是必需项。

> **多参考连续链里的位次（硬性 · 2026-10-03）**：本篇是**连续链的第 1 条**所走的路线。第 2 条起改走 `Hybrid`（接上一条实产尾帧当 `first_frame`），见 `hybrid-rules.md` 第 1 节。**不要把一条链上的所有条目都按本篇出** —— 那样每条都重新生成第一帧，衔接会断。

## 2. 固定输出壳

严格输出以下六段，字段名与顺序不得变动：

```text
subject_definitions:
<Subject 1>: ……人物身份与外观来自 <Picture 1>……
<Picture 2>: [Shot 1] 的首帧，……

summary:
[reference generation] ……

retention_analysis:
<Subject 1>（出现在 [Shot 1]）: fully_preserved - ……
<Picture 2>（[Shot 1] 首帧）: fully_preserved - ……

detailed_description:
目标视频采用真人电影风格，……
[Shot 1] 画面从 <Picture 2> 开始，……

overall_soundscape: ……

non_diegetic_music: N/A

No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.
```

Use the standard values only:

- Visual retention: `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference`.
- Audio retention: `fully_copy`, `partially_copy`, `reference`, `weak_reference`.
- Summary task types: `keyframe completion`, `reference generation`, `video editing`, `video continuation`, `audio reuse`, `audio reference`.（`audio reuse` 在本技能中**不可用** —— 见下条）
  - **本技能收窄**：参考音频只作人物声线 ⇒ 音频相关前缀**只用 `audio reference`**，**不使用 `audio reuse`**（那份词汇仍列出备查，但在本技能中不成立）。

以上字段名、引用标签、镜头标签、时间戳、枚举值、对白标签和末行技术排除句属于标准英文语法，必须保留英文。**说明性正文的语言以用户指定为准 —— 本技能默认全英文**；仅当用户明确要求中文提示词时，才回到官方 Ref2VA 写法（正文中文，术语与规范短语仍保留英文）。

## 3. Reference labels

`<Subject N>` is a reusable visible unit. Define people, environments, outfits, props, stylistic effects, or poses that will occur in the video. Cite the actual source image(s) within the definition. Example:

```text
<Subject 1> is the adult woman whose face and black updo come from <Picture 1>, while the layered red hanfu she wears in [Shot 1] comes from <Picture 2>.
```

`<Picture N>` receives its own definition only when it acts as a first frame, keyframe, last frame, or shot-planning anchor (workflow field names: `first_frame` / `last_frame`). A picture used purely to supply a character or wardrobe is cited under its subject and does not need a standalone line.

只有一张纯人物参考图时，推荐结构是只定义 `<Subject 1>` 并在其中注明来源为 `<Picture 1>`；不要再为 `<Picture 1>` 单独写关键帧定义。`summary` 使用 `[reference generation]`，`retention_analysis` 评估 `<Subject 1>` 的保留方式即可。

Insert labels naturally in `detailed_description` when they first appear and whenever their reference role matters. Keep the same label meaning in all six sections. Do not add `<Video N>` or `<Audio N>` unless such an asset was actually supplied.

## 3.5 音频参考与视频参考（`<Audio N>` / `<Video N>`）

图参考之外，H3 Ref2VA 还接受**音频参考**与**视频参考**。**只有素材确实提供了才写标签**；不要为不存在的素材造标签，也不要因为"顺手"就把某张图或某段视频拆成额外的 Audio/Video 条目。

### `<Video N>` — 视频参考

`<Video N>` 只用于**整段视频级**关系，不是用来装"可复用的可见内容"：

- 直接剪辑源视频 → `video editing`
- 从源视频结尾续写、延伸、接续 → `video continuation`
- 参考源视频的运镜、切点、节奏或整体时间结构 → 归入 `reference generation`

参考视频里的**人、动物、物件、场景、动作、特效**如果被复用到目标视频，仍归 `<Subject N>`；`<Video N>` 只标识"资产来源或结构来源"，**不替代 subject 标签**。

### `<Audio N>` — 音频参考（**只收人物声线**）

**★ 本技能硬规则（2026-10-01 用户指定）：参考音频只用于「人物声线」，且只接受用户单独上传的音频文件。**

- **用途只有一个**：把某个说话人的**音色／声线**参考过来，用于绑定目标视频里同一个人的 `(Sx)`。
- **不接受**：BGM、完整音轨、环境声、纯音效、纯乐器、节拍参考。（官方规范允许更广，本技能按用户要求收紧到只收人物声线；遇到其他类型 → 说明原因并拒收。）
- **不从 `<Video N>` 派生 `<Audio N>`**：不接受"从参考视频里抽音轨"这种做法。
- 每条 `<Audio N>` 必须对应**目标视频里确实会发声的某个说话人**。
- **不得**把参考音频里的原话、歌词当成目标视频的台词搬过去 —— 只取声线。

**保留值固定为 `reference`**：因为只参考音色、不搬音频信号，`retention_analysis` 里 `<Audio N>` 一律写 `reference`（或 `weak_reference`），**不写 `fully_copy` / `partially_copy`**；`summary` 前缀用 `[reference generation + audio reference]`，**不出现 `audio reuse`**。

> 下方「编号与配对」「落点」两节里凡涉及 BGM／整轨／音效层的写法，均以本节的收紧规则为准：那些情况在本技能中不成立。

### 编号与配对

- `<Video N>` 与 `<Audio N>` **各自独立编号**。编号只表示"在本类别里的顺序"，**不编码两者的配对关系**。
- 参考视频**不会**因为"文件里有声音"就自动产生 `<Audio N>`。**本技能里也不从视频派生音频** —— 音频只来自用户单独上传的人物声线文件。
- `<Audio N>` 的定义说明**这段声线属于谁**（对应哪个说话人 / 哪个 `<Subject N>`），写法保持简短：

  ```text
  <Audio 1> is the voice-timbre reference for the young woman in <Subject 1>.
  ```

### 与说话人的绑定

`<Audio N>` 在本技能里**必然对应某个说话人**（只收人物声线），因此**必须复用该说话人的全局 ID**：

- 说话人已是已定义主体 → 写 `<Subject N> (Sx)`
- 说话人不对应任何主体 → 用稳定的音色描述 + `(Sx)`

`(Sx)` 按目标视频里**实际发声顺序**分配一次，`<Audio N>` 的定义只是**复用**该 ID，**不得独立重新分配或编号**。

**两条硬性**：

- **不得凭空造 `(Sx)`**：没有真正的发声源就不该有 `<Audio N>`。
- **不得把参考音频里的原话搬进目标视频**：只取声线，台词仍按用户给的台词写。

### 在六段里的落点

- **`subject_definitions`**：给每个 `<Video N>` / `<Audio N>` 单独一行，说明它是什么、角色是什么、要跟随的主要特征。若 `<Video N>` 只是标识另一个条目的来源而不单独分析，就写在那个条目的定义里，不单独开行。
- **`summary`**：任务类型前缀按实际关系用 ` + ` 组合，**本技能的音频相关组合只允许 `[reference generation + audio reference]`**（不出现 `audio reuse` / `video editing + audio reuse` 等）。**只使用素材实际支持的类型**，且**不在本节引入新标签**。
- **`retention_analysis`**：每个 `<Audio N>` **单独一行**，**一律写 `reference`**（最多到 `weak_reference`），**不写 `fully_copy` / `partially_copy`**。**本节内不写 `(Sx)`。**
- **声线参考的落点固定为两处**：`subject_definitions`（说明这段声线属于谁）与 `detailed_description`（在该说话人第一次发声处引用 `<Audio N>`）。**不落进** `overall_soundscape` 或 `non_diegetic_music` —— 那两层是环境声／音效与观众专属配乐，与人物声线参考无关，照常按场景自行写。
- **`detailed_description`**：在与该声线**真正生效的那个镜头或语义阶段**引用 `<Audio N>`，并写明是音色参考（`used as a voice-timbre reference`）。
- 对白与歌词的完整原文**只**写在 `detailed_description` 的 `<d>` 里，**不要**在 `overall_soundscape` 或 `non_diegetic_music` 里重复。

> **关于音频数量与时长上限**：官方 Ref2VA 规范文本**未给出数量上限**。「最多 3 个音频、每个 2–15 秒、总时长不超过 15 秒、音频不能作为唯一参考输入」写在分镜类技能（`h3-prompt` 模式 D / E）里，属**本地约定**。
>
> **★ 本技能自持硬规则（2026-10-01 用户指定）：`<Audio N>` 上限三条（N = 1–3），且只收人物声线参考音频。** 用户提供更多时只取前三条并当场说明；提供 BGM／整轨／环境声／音效类的，**说明原因并拒收**（只收声线）。出词前必须问一次「要不要上传**人物声线**参考音频」（见 `SKILL.md` E2）；选不需要则不加任何音频标签。音频不能作为唯一参考输入 —— Ref2VA 至少需要一份**视觉**参考。

## 4. Visual writing and timing

- The style sentence comes before `[Shot 1]`. `[Shot 1]` has no timestamp. Later cuts use `[Shot N] At MM:SS.mmm, ...`, with strictly increasing cut times below the target duration.
- Default to 5 seconds when duration is unspecified; use the requested integer duration from 5 to 15 seconds when supplied. Pace story beats conservatively and leave 0.4-0.8 seconds of ending hold.
- Anchor the opening composition to the selected keyframe. State reference-derived character, wardrobe, environment, lighting, and camera facts at first clear appearance.
- Keep one motivated primary camera movement. Use H3 camera terms such as `Push In`, `Tracking Shot`, `Pan`, `Tilt`, `Truck`, `Arc Shot`, and `Static Shot`, with amplitude and speed when material. Couple every camera move to a concurrent subject action.
- For every substantive pose or weight change, describe the bodily transition: hands/support, torso, hips, knees, feet, and resulting balance. Do not teleport between poses or use impossible solo positions.

视觉与声音正文**默认写英文**（与本技能另两条壳一致）。若用户明确要求中文正文，则改按官方 Ref2VA 写法：正文写中文，必要的 H3 运镜术语保留英文并嵌入中文句子，例如“镜头以小幅、慢速 `Push In`，同时……”。后续切镜仍以 `[Shot N] At MM:SS.mmm,` 起始。

## 5. Adult erotic direction retained from the source skill

All people must be clearly adult. Use direct, accurate terms where requested, including `breasts`, `nipples`, `pussy`, `clit`, `wet folds`, `penetrate`, `suck`, `lick`, `grind`, and `cum`; do not replace requested explicit action with vague euphemism.（本技能默认英文正文，直接使用上述词表；仅用户要求中文正文时改用对应的中文直白词。） For sustained sexual action, specify the relevant body parts, direction, contact, and a stable `steady` or `moderate rhythm` unless the user requests another intensity.

Build a coherent erotic arc from the image roles: persona and initial state, contrast/turn, trigger, and a final held payoff. Do not use blushing. If dialogue is used, keep it proportionate to duration, in Chinese within `<d>[Chinese] ...</d>`, give speakers stable `(Sx)` IDs, match the address to the persona, and write lip/jaw/breath synchronization. The full inherited source reference retains additional vocabulary, examples, and micro-rules; use it for wording and execution, while replacing its I2VA-only output shell with this Ref2VA shell.

## 6. Cases and technical checks

When adapting a named library case, retain its action causality, camera design, audio concept, and ending, then rewrite the result completely in the six-section Ref2VA shape. Bind each newly visible person, scene, garment, prop, and frame anchor to current `<Subject N>` and `<Picture N>` labels.

Before delivering, verify:

- every input image is either deliberately used or omitted without a false label;
- a lone character reference remains a subject source rather than being falsely declared a first frame;
- every label in the later sections was defined and has one stable meaning;
- the retention marker accurately describes what remains from each reference;
- **this prompt covers every plot beat of its script segment, with no omissions and no invented plot**: no beat dropped, merged, or summarized away, no dialogue rewritten or reassigned, no action result changed (a section that will not fit means a longer duration or an extra prompt, never a cut).
- **every character's facing is stated for the shot** — relation to camera (facing it / three-quarters / side-on / back to camera), left or right within frame, and how the two relate to each other; no unmotivated turn, and any turn is written as an action (see `nsfw-template.md` section 5, item 5).
- every plot beat of that scene in the script is covered — nothing dropped, nothing invented, dialogue verbatim from the script (check against `<工作区>/故事/<作品名>.md`); if it does not fit, lengthen the clip or split it, never cut story;
- the first-frame or keyframe anchor is explicit when present;
- no single-image I2VA fields remain;
- every supplied audio or video asset appears as its own `<Audio N>` / `<Video N>` line with the correct retention marker, and no such label is invented for an asset that was not supplied;
- when a reference video is used, its visual reuse is labelled by `<Subject N>` while `<Video N>` only carries the asset or structural role;
- `(Sx)` is assigned only to sources that actually vocalize, is reused rather than renumbered inside `<Audio N>` definitions, and never appears in `retention_analysis`;
- every `<Audio N>` is a character voice-timbre reference that is bound to a speaker's `(Sx)`, carries the retention marker `reference` (never `fully_copy` / `partially_copy`), is not invented for an asset that was not supplied, and is not derived from a `<Video N>`;
- ambience and effects for the target video are written from the scene itself in `overall_soundscape`, audience-only score lands in `non_diegetic_music`, and dialogue or lyrics are written only inside `<d>` in `detailed_description` (a voice-timbre reference never supplies them);
- official syntax remains English while descriptive prose follows the user's designated language (**English by default** in this skill; Chinese only when explicitly requested);
- sound does not repeat dialogue, music defaults to `N/A`, and the technical exclusion line is last.
- **the delivered file is byte-clean: no stray carriage return (`\r`) and no junk lines that consist only of whitespace or `>`** — a lone CR followed by trailing spaces (e.g. `\r>   ` / `\r  `) silently injects garbage into the prompt body and shows up as phantom `>   ` lines; keep one consistent line ending (CRLF on Windows) and re-check after ANY programmatic write to a prompt file.（中文：交付前查文件行尾 —— 不得有孤立 CR，不得有纯空白/纯 `>` 的伪行；**任何脚本写回提示词文件后都要复查**。）