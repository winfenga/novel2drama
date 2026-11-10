# base — 共用骨架（M3-1）

> 本文件由 M3-1 生成，依据：docs/m35-spec.md §2.2/§3/§4-F3；docs/h3-prompt-rules.md §2.1（六段骨架）/§2.1.1（Hybrid 版）/§2.2（三字段）/§2.3（枚举 L165-171）/§3（三条链上铁律）/§5.1-§5.2（运镜六条+摄像机归因六条）/§5.3（POV）/§5.5（Facing L440-450）/§5.6-§5.9（台词与声音）/§六（自检清单六节）；docs/storyboard-rules.md §六（连续性与镜头设计要素 L355-394）/§一（八条铁律 L34-59）；docs/architecture.md L726-734（八板块清单）；docs/excerpts/01_nsfw-template_全文.md L156-191（输入处理三情况）/L192-214（全局生成规格）/L246-273（镜头体系/说话人）/L276-333（运镜原文）。
>
> 说明：本文件是**共用于全部 task_type 与全部内容模式的骨架**。策略层（尺度、术语、负面词）在 policy-sfw.md / policy-nsfw.md，输出结构在 shells/。提示词正文英文、说明性文字中文。

## Section 1 · 角色设定与身份（Role & Identity）

（规则来源：h3 §2.1/§2.4；EX11 character-scene-sheet；storyboard-rules §5.2 单点定义铁律）

- **单点定义**：每个角色只有一处唯一定义（`<Subject N>` 定义行），其余位置只引用编号、不复述、不改写。
- **身份锚点绑定参考图**：人物身份与外观来自 `<Picture N>`，用 `the … shown in <Picture 1>` 句式建立绑定（如 `the young woman with long straight black hair shown in <Picture 1>`）。身份、服装、颜色、关键道具、空间关系全片保持一致。
- **纯人物参考图不单独定义 `<Picture N>` 行**：`<Picture N>` 只在它作为首帧、关键帧、末帧或分镜锚点时才单独定义；纯提供人物/服装的图挂在 `<Subject N>` 名下。
- **关键帧不承载身份**（Hybrid）：`first_frame` / `last_frame` 只描述画面事实；声线与身份一律绑到参考图 `<Picture N>`。关键帧不得写成 `<Subject N>`，也不在关键帧行塞声线或性格。
- **外形锁定**：角色定妆/外观特征（发色、瞳色、服装、体态）逐字沿用设定，不得临场改写；脱衣后裸体是同一人物的自然延续，不需重新绑定。
- **From-facts 重建**（storyboard §一 R3）：每个分镜的第 0 秒初始空间位置从事实（剧本 + 上一镜结束状态的事实结果）重建，不沿用渲染帧；镜内所有位移必须可由初始位置连续推出；禁止人物/道具凭空换位、消失、出现。

## Section 2 · 输入处理（三情况）（Input Handling）

（规则来源：EX01 L156-191；h3 §一路由判定 L26-84）

按素材构成先判路线，再按情况处理：

- **路由判定**（顺序执行，判不出才问用户）：多参考连续链第 1 条 → Ref2VA，第 2 条起 → Hybrid；单图即 0.00s 首帧且无其他素材 → I2VA；单图首帧 + 参考素材 → Hybrid；图仅作参考或多图 → Ref2VA；无任何视觉素材 → T2VA；判不出 → 兜底 T2VA 并向用户回显判定结果。
- **硬约束**：素材里带了音频或视频参考时，只能走 Ref2VA 或 Hybrid——I2VA 与 T2VA 的壳里没有 `<Audio N>` / `<Video N>` 的位置。冲突时明确报错引导改路，不静默降级。
- **情况 A（只有图、无指令）**：执行图片故事性反推（人设、初始状态、故事弧、机位三要素）。图内只有女性时按反推结果创造故事弧完整、神情有渐变过程的场景；多人同图给协同或分工设计，说话人按 `(Sx)` 分配。图内含男性/动物/怪物等其他生命体时**不直接出词**，先一句话确认创作思路，等用户回复后按情况 B 执行。一次发多张图：不挑一张，逐张判定实际角色后走 Ref2VA；用户明确要走 I2VA 才选定一张。
- **情况 B（图 + 指令）**：以用户指令为最高优先级；在指令基础上补全其余要素（人设反推、故事弧完整度、神情渐变、动作连贯、位移过渡、镜头语言、光影氛围、声音设计）。指令与图冲突时：图锁定人物身份、服装、场景、机位等可见事实；指令决定动作、台词、剧情结果。
- **情况 C（只有文字）**：改走 T2VA（三字段壳、无指令行、正文英文、不得出现任何参考标签）。不得凭空捏造 `<Picture N>`。用户想要「先有图再动」可先给文生图提示词，出图后回 I2VA；两条路先与用户确认。

## Section 3 · 全局生成规格（Global Generation Spec）

（规则来源：EX01 L192-214；h3 §3.3 三条链上铁律；storyboard §一 R1/R4/R5/R6）

1. **时长 T 秒**：用户明确给出秒数时用用户秒数（5-15 秒内取整；低于 5 取 5，高于 15 取 15）；未指定默认 5 秒。**提示词正文不声明秒数、分辨率、画幅**——时长与分辨率在提交参数中设置；T 通过切点时间戳与结尾落点表达：所有 `[Shot N]` 切点时间戳严格递增且小于 T，最后一个镜头的动作与定格收束于 T 秒。
2. **剧本一致性（硬性）**：提示词是剧本的镜头化转写，不是摘要。每一个剧情节拍（动作、转折、对白原话、动作结果、在场者变化）都必须落到提示词里——不得减少、不得概括、不得跳过；也不得增加剧本没有的剧情与台词（可见外形服从参考图，剧情服从剧本）。塞不下时：① 加时长（上限 15 秒）→ ② 拆成两条 → ③ 绝不删节拍。
3. **事实铁律**：可补充「美术细节」，绝不补充「剧情事实」。证据优先级：剧本原文 ＞ 原文直接推断 ＞ 合理美术补全；无证据的关键事实标【待确认】。
4. **所见即所得**：提示词只写镜头内实际可见/可闻的内容；心理活动、设定说明、镜头外事件不得写进画面与动作描述。
5. **人物朝向 Facing（硬性）**：每个人、每个镜头都要写清朝向，三要素缺一不可：
   - ① **相对镜头**：正面对镜 / 3⁄4 侧向 / 侧向 90° / 背对镜；
   - ② **画框左右**：面朝画面左 / 面朝画面右（侧向时必须写）；
   - ③ **两人相对关系**：面对面 / 一前一后同向 / 背对背 / 一方在另一方背后。
   - **写法**：紧随风格句之后写一条 `Facing:` 句；出场角色各写一句，主角在前。例：
     `Facing: she has her back to the camera with her body angled frame left; he lies face-up, which is toward the camera.`
   - 同条内不得无动机转向；确实要转身必须写转身动作并把变化写进同一句。跨条目朝向要在承接/下接里对得上；同一场景保持固定机位轴线与左右关系。只写 `she looks at him` 不写谁朝哪边 ⇒ 必出随机朝向，禁止。
6. **锚定首帧的开场节奏（硬性）**：以某张图作为 0.00 秒首帧的条目（I2VA / Hybrid / 挂首帧锚点的 Ref2VA），从 0.00 秒到本场第一个剧情节拍启动**不得超过 0.5 秒**——这是连贯性规则，不是节奏审美：上一条的末帧正处在运动中，本条开头若定格再动，接缝处立刻显出「两段」。0.5 秒是上限不是目标，越短越好。禁写清单（中英文皆禁）：`the camera holds still on the image` / `the frame holds` / `remains motionless` / `freezes for a moment` / `stays still before` / `a brief pause before the action` / `the shot lingers` / `slowly comes to life`。抬眼、呼吸、视线移动**不算剧情节拍**，不能拿来充当开场动作。锚点句写法：`opens exactly on the first_frame image; the motion carried in from the previous clip continues without any hold, and her <本场第一个剧情节拍> is already underway within the first 0.5 second.` 挂了尾帧时，最后一个 `[Shot N]` 的末帧必须精确落在 `last_frame` 构图；没挂尾帧时全文不出现尾帧描述。
7. **位移三要素（防姿态瞬移）**：故事弧中存在姿态/重心变化（坐→跪、站→俯身、躺→撑起）时启用；原地小动作（揉乳、解扣、舔唇）不触发。写法（从→到）：**骨盆**从哪里移到哪里、**双腿**从什么配置变成什么配置、**躯干**从什么角度变成什么角度。上一秒还端坐、下一秒已躺平而中间没有下沉过程 = 姿态瞬移，禁止。
8. **技术排除行**：`No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.` 附在最后。

## Section 4 · 分镜与镜头体系（Shot / Cut）

（规则来源：EX01 §六.4 L246-253；storyboard §六 L355-394）

- `[Shot 1]` 为开篇镜头，**不打时间戳**；开头先声明整体风格（`Live-action, cinematic` / `2D-animated` / `3D CG` 等，从素材推导），再按机位三要素（高度/角度/距离）声明初始构图（如 `a static medium shot at eye level`），锚定首帧的画面主体、构图与场景，然后向前发展。
- 后续镜头递增编号，每个镜头以严格递增且落在视频时长内的切点时间戳开头：`[Shot 2] At 00:06.500, the camera cuts to ...`（MM:SS.mmm）。
- 普通切镜用 `the camera cuts to` / `the shot cuts to` / `the shot transitions to` / `the shot changes to` / `the shot switches to`；只有用户明确要求才用叠化、淡入淡出、划像。
- 每次切镜必须带来新信息（主体、空间、状态、视角或时间的变化）；只是距离或角度的轻微变化时优先用运镜而不是切镜。
- 成人内容默认单镜头连续拍摄（利于动作连贯与神情渐变）；只有在确实需要换视角承载阶段转换时才设置切镜，切点落在故事弧转换节点上。
- **镜头设计要素**：景别（远景仅空镜/环境建立、全景、中景、近景、特写），相邻镜避免同景别连续，**人物不入远景/大全景**；动作写法只写「谁→做什么→对谁→结果→必要声音/物理反馈」，一镜一核心事件；禁空泛副词（极具力量感地/帅气地/如鬼魅）。
- **群像焦点**：当前焦点是谁就拍谁；镜外人物不写动作不点名，只写「看向画外某方向」或「传来画外音」；对话过肩（OTS）遵循轴线，同场不越轴。
- **编号纪律**：`<Picture N>` 从 1 起按用户给图顺序连续编号，编号总数 = 用户本次给的关键图张数；`<Audio N>` / `<Video N>` 各自独立编号、从 1 起，不被关键帧挤位；`(Sx)` 按目标视频实际发声顺序分配一次，`<Audio N>` 的定义复用该 ID，不得独立重新分配。`<Audio N>` 每条 2-15 秒，音频不能作为唯一参考输入。`<Video N>` 只标结构来源：直接剪辑源视频 → `video editing`；从源视频结尾续写 → `video continuation`；参考运镜/切点/节奏 → `reference generation`；视频里的复用元素仍归 `<Subject N>`。

## Section 5 · 运镜六条 + 摄像机归因纪律（Camera Rules）

（规则来源：h3 §5.1/§5.2，EX01 L276-333 逐条收录；Arc Shot 用途裁决表一并写入）

**运镜六条（全部强制执行）：**

1. **起点锚定（唯一硬规则）**：运镜必须从**参考图机位**出发。禁止方向冲突——俯拍起点不升镜、仰拍起点不降镜、背面起点不正面直推、远景起点不切特写开场。
2. **一条主运镜**：全片一条主运镜（缓慢推近最常用），至多叠加一个次运镜（如推近+轻微横移）。默认单镜头、镜头稳定；变化贵在准确，不在数量。
3. **运镜跟随故事弧**：铺垫段镜头稳（Static 或极缓），转变段镜头开始动（推近/横移），高潮段镜头最近或定格。每次镜头变化必须对应故事弧的转折点——先有情欲/剧情动机，再有镜头运动，禁止无动机空转。
4. **镜头-动作同步**：写镜头运动的句子必须同时写人物在同一时间在做什么。禁止镜头独自运动而人物静止等待。
5. **三问（不是查表）**：① 展示方向朝哪——镜头就往哪个方向靠近；② 高潮落点在哪个部位或哪张脸——镜头终点就停在哪里；③ 参考图机位留给镜头的合法运动方向是什么——在合法方向内选。
6. **官方词表**：`Zoom In / Zoom Out`、`Push In / Pull Out`、`Pan Left / Pan Right`、`Truck Left / Truck Right`、`Tilt Up / Tilt Down`、`Pedestal Up / Pedestal Down`、`Arc Shot`、`Tracking Shot`、`Static Shot`、`Shake Slightly / Shake Strongly`、`POV`、`Roll Clockwise / Roll Counterclockwise`，按需加 `with small/large amplitude`、`at slow/fast speed`（中等幅度、常速省略）。运镜写成镜头内的自然英文句子，不在句尾堆标签。**禁止**：任何运镜编号、技术参数（速度数值、厘米、角度值）、「电影感运镜」式空话。

**Arc Shot 用途裁决表（按用途分，不是一刀切）：**

| 用途 | 允许？ | 条件 |
|---|---|---|
| POV 进场（§5.3 复合运镜） | ✅ 允许 | 必须慢速（`at slow speed`），必须带终点落点（`POV`），片中只此一次 |
| 单纯绕人物转圈当主运镜 | ⚠️ 谨慎 | 只在静态或微动态镜头用；幅度 `small amplitude` |
| 动作镜头 / 打斗 / 快速位移 | ❌ 禁止 | 拆成 `Truck Left/Right` + `Pan Left/Right`，两段分开写 |
| 人物入远景 / 大全景 | ❌ 禁止 | 人物不入远景大全景 |

**POV 复合运镜**：起点必须是参考图机位；一条复合运镜走完（`Arc Shot` 绕向目标角色头部 ＋ 同步 `Pedestal Up/Down` 到眼高，终点写 `POV`）；写清三件事——起点是参考图机位、终点是哪个角色的眼位、到位后该角色的脸出画只留身体在画面下缘。**不得为了迁就镜头而让人物转身**：第三人称机位下背对镜头、切到 POV 后自然正对镜头是**视角变化**不是人物转身，同一条里不得再写转身动作。POV 下「她朝向镜头」＝「她面朝他」，是同一件事，不要重复声明成两个动作。

**摄像机归因纪律（六条，硬性）**：画面里出现的一切变化，必须归因于「摄像机移动」——不得写成「人物移动」或「场景移动」。

1. **先声明不动的部分**：`the camera is the only thing that travels in this clip` ＋ `every change that becomes visible in the frame is produced by the camera moving and by nothing else`。
2. **画面变化必须带摄像机归因**：写「他的身体移到画面下缘」必须写出原因——`only because the camera now sits above his chest looking down the length of his body`。不带归因的取景结果陈述会被读成人物自己在位移。
3. **人物只允许「姿态变化」**：俯身→直起、坐→跪、仰→侧须与运镜句分开写，注明 `her own posture changing and not a move across the room`。
4. **绕行/升降运镜下禁止声明全局左右轴**：`frame left and frame right never flip` 只在固定机位成立；摄像机一旦绕行，画面左右必然随之旋转——强求左右不变等于要求场景跟着摄像机转。改为按「开场朝向/落定后朝向」分段写。
5. **绕行之后不得再按画面方位写光**：只写 `the window light`，不写 `the light from the left of the frame`。
6. **POV 落到谁的眼位，摄像机就在谁的头/眼处**。

## Section 6 · 台词规则（Dialogue Rules）

（规则来源：h3 §5.6-§5.9，EX01 §六.5/§九）

- **台词配额**：5s 0–1 句（1 句为佳）；6–8s 1–2 句；9–12s 2–3 句；13–15s 3–4 句。台词落在动作相对稳定的片段，不在剧烈位移或高速律动中途说。
- **说话人封装**：出声的角色分配稳定 ID `(S1)`、`(S2)`……；多人同时发声用复合 ID `(S1,S2)`；ID 全片不变；从不出声的角色不分配 ID。说话人首次出现时在 `<d>` 外给身份与音色描述（角色类型、年龄感、音高、音色、语速、情绪质感，英文），随后接台词。
- **台词标签**：台词写在 `<d>[Chinese] ...</d>` 内，逐字保留，不翻译、不改标点。身份、ID、动作、语气全部写在 `<d>` 外。画外音：`says in an off-screen voiceover` ＋ `while her lips remain completely closed.`；台词跨切镜：`<scenetrans>` ＋ `continues seamlessly across the cut`；台词被结尾截断：`<cutoff>`。画面内可见文字加英文双引号。
- **口型同步（三条硬规则）**：① 台词期间嘴必须张——必须用 `her lips part and her jaw drops` 开头；只写 `her red lips part slightly` 作为表情是禁止的（那是状态描述不是发音动作）。② 下颌呼吸停顿与发音同步：`Her jaw resets at the pause, her nostrils flare slightly as she takes a breath, then her jaw drops again as she continues: <d>[Chinese] ……</d>`。③ 无台词时嘴唇自然闭合，禁止「欲言又止」式无意义嘴部动作（刻意的喘息半张唇不在此列）。正确示例：`Her lips part and her jaw drops, and the young woman with a soft, clingy, smiling voice (S1) says: <d>[Chinese] ……想要吗？</d> Her jaw resets at the end of the line, her nostrils flaring slightly as she takes a breath.`
- **对白三重校验**：人设（谁在说）＞ 场景（在哪说、说得出口吗）＞ 故事弧模板（说什么类型的话）。称呼由人设决定、全篇统一；隔一堵墙还大喊 = 违规；场景里不存在的不能说，存在的最好用上；换地点必须重写对白。
- **台词密度 → 拆条**：先数台词再定条数，N 句台词 ⇒ 至少 `ceil(N / 3)` 条；剧本是定数，条数与时长才是变量；交付前用剧本台词表逐句打勾。镜头不能比台词短（镜头时长 = 台词时长 + 前后留白）。
- **外形约束落进动作**：外形设定与动作必须自洽，禁止写冲突动作（短发角色禁止「手指插进头发」）。

## Section 7 · 声音设计（Sound Design）

（规则来源：h3 §5.8；h3 §四 `<Audio N>` 落点）

- **`<Audio N>` 在六段里的落点**：`subject_definitions` 单独一行说明声线属于谁；`summary` 音频相关前缀见壳文件；`retention_analysis` 每个 `<Audio N>` 单独一行（本节内不写 `(Sx)`）；`detailed_description` 在该说话人真正生效的镜头或语义阶段引用，写明 `used as a voice-timbre reference`；不落进 `overall_soundscape` 或 `non_diegetic_music`。
- **`audio reuse` vs `audio reference` 判据**：声音内容换不换？不换（原样搬用波形，台词是剧本原句情绪语气都对）→ `audio reuse`；换了（只借音色/语速/口音特征，内容重念）→ `audio reference`。多角色对话每角色一条 `<Audio N>`，各用 `audio reference` 分开锁声线。
- **`overall_soundscape`**：1–4 句英文，概括环境声、动作声、非语言人声（呼吸、轻喘、呻吟、体液声）。**台词与唱词属于主体字段，此处一律不重复。**仅当用户明确要求全片无声才写 `N/A`。
- **`non_diegetic_music`**：1–3 句英文，只写乐器、速度、节奏、力度变化，**禁止抽象情绪词**（「梦幻的」「情欲的」不得用于配乐描述）；无配乐写 `N/A`。
- 技术排除行附在 `non_diegetic_music` 之后（见 Section 3 第 8 条）。

## Section 8 · 自检清单骨架（Self-Check Skeleton）

（规则来源：h3 §六合并版，六节全收）

**8.1 结构层**：段数正确（T2VA/I2VA 三字段且 T2VA 无指令行；Ref2VA/Hybrid 六段）；字段名与顺序正确无增删改名；枚举值只用标准值；技术排除行在最后一行；文件字节干净——无孤立 CR，无纯空白或纯 `>` 的伪行。

**8.2 编号契约层（Hybrid 专项）**：素材构成满足 Hybrid（≥1 关键帧 ＋ ≥1 参考素材）；关键帧用字段名 `first_frame` / `last_frame`（带下划线、反引号包裹，不是空格版，不是自造 `<First Frame>`）；`subject_definitions` 里有独立的关键帧行，正文里没有把关键帧写成 `<Picture N>`；参考图从 `<Picture 1>` 起连续编号且不因关键帧数量移位；编号总数 = 用户本次给的关键图张数；`<Audio N>` / `<Video N>` 编号没有被关键帧挤位；关键帧没有被写成 `<Subject N>`；身份锚点绑在参考图上；挂了尾帧时最后一个 `[Shot N]` 末帧精确落在 `last_frame` 构图。

**8.3 连贯层**：`[Shot 1]` 从首帧内部启动（`opens exactly on the first_frame image`），第 0 帧没有换姿势/构图/视线/道具持握；开场 0.5 秒内第一个剧情节拍已启动；正文里没有任何「停留/定格/缓缓起手/先展示再动」写法；抬眼、呼吸、视线移动没有被当成开场动作；铺垫段已压到 0–0.5 秒；链上条目已写明「动作自上一帧延续、中间无停顿」；文件头有承接/下接两行。

**8.4 内容层**：本条覆盖剧本该场景的全部剧情节拍，未删减、未增改；台词逐字来自剧本，没有改说话人、没有改动作结果；每个人物、每个镜头的朝向都写明了（相对镜头 + 画框左右 + 两人相对关系）；全条无无动机转向，转身处写了转身动作；实际走的模式与选定的分支一致；人物外形与设定/参考图一致。

**8.5 声音层**：`(Sx)` 只分配给真正发声的源；`<Audio N>` 定义里复用 `(Sx)` 不重新编号；`retention_analysis` 里不出现 `(Sx)`；`overall_soundscape` 不重复台词；`non_diegetic_music` 无抽象情绪词；台词/歌词原文只写在 `detailed_description` 的 `<d>` 里。

**8.6 语言层**：官方语法（字段名、标签、时间戳、枚举值、排除行）保留英文；说明性正文语言符合用户指定；台词在 `<d>[Chinese] ...</d>` 内逐字保留；画面内可见文字加英文双引号。

## 附录 · 枚举值全集（Enum Reference）

（规则来源：h3 §2.3 / §2.3.1——两处资料口径不一，裁决：`audio reuse` 与 `audio reference` 都保留，按「要不要原音频波形」区分）

- **视觉保留**：`fully_preserved` / `partially_preserved` / `attribute_transfer` / `weak_reference`
- **音频保留**：`fully_copy` / `partially_copy` / `reference` / `weak_reference`
- **summary 任务类型**：`keyframe completion` / `reference generation` / `video editing` / `video continuation` / `audio reuse` / `audio reference`
- `<Audio N>` 默认从 `reference` 起步。
