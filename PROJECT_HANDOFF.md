# Perfect Player 项目交接

> 状态快照：2026-10-01（Asia/Shanghai）  
> 本地目录：`D:\deepseek ai result\my perfect player`  
> GitHub：<https://github.com/zy1162-tech/My-perfect-player>  
> 在线版：<https://zy1162-tech.github.io/My-perfect-player/nba-perfect-player.html>  
> 当前线上提交：`196c5038cce9a59d3ee253fb5692e52298f5c2d6`

## 1. 产品目标

这是一个以“球员第一人称生涯”为核心的浏览器 NBA 模拟游戏，不是总经理模拟器。下一阶段的主目标是：

1. 比赛、赛季和生涯数据在不同年代都更接近真实篮球分布。
2. 不同球员拥有能被玩家看见、能被测试复现的成长、巅峰、衰退和退役轨迹。
3. 巨星、普通首发、轮换与边缘球员的作用和使用率有明显差异，但不硬编码单场结果。
4. 保留现有模式、剧情、头像、教练体系、旧档兼容和移动端体验。
5. 在有证据和回归测试的前提下删除重复、失效或不再调用的代码；不做无依据的整库重写。

“拟真”必须转化为可量化验收，而不是根据一两场截图反复调常数。

## 2. 当前功能基线

- 现役生涯模式，以及 2003、2010、2016 三个传奇年代。
- 默认进入联盟年龄为 19 岁。
- 传奇年代采用 30 队、每队最多 15 人，支持真实球员多位置排阵。
- 年代球员包含开局评分校准、潜力、巅峰、年龄成长、衰退和历史退役节点。
- 季后赛赛前显示阵容；玩家系列赛每场结束后强制显示双方数据。
- 当前季后赛赛后面板列为：球员、得分、篮板、助攻、抢断、盖帽。
- 休赛期报告、阵容变动、总冠军和 FMVP 通知、教练与体系卡、球队老大裁人建议。
- 球风技能单季所有来源合计最多 32 点；“耐力专精”是无等级上限的球风点消耗项。
- “续航储备”不是球风点技能，由生涯剧情与赛季体能管理改变，上限 12。
- 传承祭坛初始 30 点；成就奖励表合计 150 点；十条路线均可升至 5 级。
- 现役与传奇分别使用 `lenf_auto_slot`、`lenf_legend_auto_slot` 两个自动存档键。

## 3. 代码地图

| 区域 | 主要文件 | 职责与注意事项 |
|---|---|---|
| 页面入口 | `nba-perfect-player.html` | 脚本加载顺序、CSS 版本和静态资源版本；不要随意重排 |
| 启动与懒加载 | `assets/js/perfect-player-boot.js` | 按 career/story/live 三组加载可选模块，并注册 Service Worker |
| 核心状态与赛季 | `assets/js/perfect-player-core.js` | 约 19,274 行；状态、比赛、Box Score、季后赛、成长、退役、休赛期和存档均在此 |
| 比赛观看 | `assets/js/perfect-player-live-sim.js` | 文字直播和回合模拟 |
| 球场动画 | `assets/js/perfect-player-live-court.js` | SVG 球场与球员跑位，不应和数值校准混改 |
| 年代联盟 | `assets/js/perfect-player-era-mode.js` | 组装年代名单、选秀班次、交易修正、年龄/位置/退役修补 |
| 年代与选秀数据 | `assets/data/era-complete-rosters.js`、`assets/data/era-mode-data.js`、`assets/data/historical/` | 大名单、历届选秀、奖项与历史球队数据 |
| 评分校准 | `assets/data/player-rating-calibration.js` | 开局 OVR、峰值与生涯曲线的集中入口；版本为 `20261001-season-stars-v5`，高分段不再被角色估计上限统一扣分 |
| 球风技能 | `assets/js/perfect-player-skills.js` | 技能等级、属性门槛、32 点上限与耐力专精 |
| 成就与传承 | `assets/js/perfect-player-enhancements.js` | 成就奖励、传承祭坛迁移与续航储备展示 |
| 教练与体系 | `assets/js/perfect-player-mod-v4.js` | 轻量体系卡，影响节奏、三分倾向和攻防效率，不改名单和位置 |
| 赛季报告 | `assets/js/perfect-player-season-report.js` | 冠军/FMVP、休赛期本队进出、阵容快照 |
| 剧情系统 | `perfect-player-event-runtime.js`、`perfect-player-event-library.js`、`perfect-player-story-events.js`、`perfect-player-era-story.js` | 事件调度、跨赛季剧情和年代主线 |
| 头像与中文名 | `era-presentation.js`、`era-headshot-index.js`、`verified-headshots.js`、图片目录 | 补图覆盖明确姓名/别名；真人照片单张白底，失败后顺次换源；虚构新人隔离真人肖像 |
| 缓存 | `sw.js` 和所有 HTML 查询版本 | 修改脚本/CSS 后必须同步更新查询版本和缓存名，否则手机继续使用旧代码 |

`assets/js/hupu/` 是外部母版拆分脚本，文件很大。除非调用链证明必须修改，否则把它视为上游/供应代码，不在清理阶段随意格式化或重写。

## 4. 模拟与成长的真实调用链

### 比赛结果与数据

`simulate82StyleMatchup` 生成比赛攻防效率和比分；`simulateGameNew` 等入口复用它；`generateBoxScore` 再把球队总分、240 分钟和球员统计分配到具体球员。出手排序由 `shotPriorityRating` 等评分共同决定。

因此，修复“奥尼尔像蓝领”“控卫必然占最高球权”“整体命中率过高”时，应优先检查共享的使用率、出手优先级和命中率函数，不要分别在每个页面上打补丁。

### 成长、衰退与退役

- `getLeagueAgeDevelopmentFactor`：联盟球员逐年成长/衰退。
- `getEraPlayerPrimeFloor` 与球员 `_peakOvr`、`_primeStartAge`、`_primeEndAge`、`_postPrimeDecay`：历史球员身份曲线。
- `getPlayerLongevityProfile`、`getPlayerRetirementRisk`：玩家自己的生涯长度。
- `HISTORICAL_RETIREMENT_AGE` 与核心退役档案：联盟真实球员退役。
- `evolveLeague`：赛季结束后统一执行续航变化、球员成长、衰退、退役和新人补充。

球员差异应优先由“年龄 + 潜力 + 峰值 + 巅峰窗口 + 衰退率 + 伤病/波动”共同表达，而不是为每个名字写一套独立 if/else。

## 5. 存档兼容边界

这是后续修改必须保留的行为：

- 新年代开局可以使用最新版评分校准。
- 已经保存的年代联盟不能因为代码升级而被重新按比例改写 OVR 和属性。
- 旧档允许幂等补齐缺失元数据、修复位置、头像、错误年龄和已经超过明确退役节点的球员。
- UI、赛后面板和共享模拟公式刷新后可直接作用于旧档；“开局名单/开局评分”通常只对新档生效。
- 传承迁移保留旧等级，按新成本重算已花点数，不扣等级。

任何需要改变旧档球员数值的方案，都必须先给出明确迁移规则、回滚方式和测试，不能把新档校准偷偷套在旧档上。

## 6. 当前验证结果

2026-10-01 的 P0 已完成测试恢复与模拟基线：

- 28 个 `tools/test-*.mjs` 全部通过，包含新增的四年代复现检查。
- `test-mod-v6.mjs` 加载正式评分校准，分开核对源评分与当季评分；名单检查改为可用轮换与 15 人上限，不要求休赛期转会后每队恰好 15 人。
- 查明并修复 `applyEraDraftNight` 先删除球员、后判断同队的共享错误。2003 Barbosa、2010 Crawford 等已经在正确球队的新秀不再消失；旧档已有交易与 OVR 保留。
- 2010 开局 Crawford 应在 ATL，WAS 交易发生在 2011-02-23，已按 [NBA 官方公告](https://www.nba.com/wizards/news/trade_022311.html) 修正选秀归属表。
- `test-v8-era-feedback.mjs` 补齐正式生涯档案依赖，并核对当前传承版本 6。
- `bench-shot-distribution.js` 已恢复运行并通过。补齐传承效果函数、统一新旧公式的十人分母、更新方差检查；单场 13% 出手目标按整数出手取最近整数，默认每场景 10,000 次直播采样。
- 三个真实 Chromium 检查通过：`browser-rating-calibration.cjs`、`browser-team-systems-era-prologue.cjs`、`browser-build-roll-smoke.cjs`，覆盖旧档、评分、教练体系、年代序章、现役和三个传奇年代的创建球员流程。
- HTTP 本地页在 320/390 宽度检查通过：加载遮罩退出后页面可见、无横向溢出、2010 Crawford 在 ATL；390 宽度实际画面已查看，见 `tools/artifacts/baseline-mobile-390.png`。
- 查询版本为 `20261001-opening-roster-v34`，缓存为 `perfect-player-shell-20261001-opening-roster-v23`。本轮没有调整比赛参数或发布 GitHub。

已通过的关键回归包括：评分校准与分布、出手分布、季后赛平衡、球员数据链、退役/评分下限、年代位置/头像/剧情、球风点、传承经济、赛季报告和教练体系。

完整统计见 [P0 基线记录](tools/artifacts/simulation-baseline.md)。命令：`node tools/bench-era-baseline.mjs 2610 32 20261001`，输出完整 JSON；复现检查：`node tools/test-era-baseline.mjs`。

四组共 10,440 场，各 2,610 场；每队 174 场。固定开局名单，成长重复 32 次单次休赛期结算，退役按开局档案测算，不代表完整生涯。基准使用正式函数与隔离 VM 中的现有 RNG，报告均值和 P10/P50/P90，检查投篮得分及球队总分守恒。

当前发现的拟真缺口：四年代平均得分仍约 116、回合数约 99，使用同一套现代常数；加时分钟仍固定 240；2003/2010 存在重复身份，现役基础名单中 Nate Williams 年龄为 73。具体名单与分布已记录；下一阶段先核对来源，再校准，不能把测试通过当成拟真已经完成。

## 7. 本地与 GitHub 状态

2026-10-02 UI 与发布轮：用户已明确授权优化 UI、精简代码并上传目标仓库 `zy1162-tech/My-perfect-player` 的 `main`。发布前已核对父提交仍为 `196c5038cce9a59d3ee253fb5692e52298f5c2d6`。这一轮包括此前未上传的评分、补图与测试恢复，并排除本地运行目录及未审查素材。

- UI：暖色背景与白色卡片、桌面双列和手机单列、球员卡片与战绩层级、键盘选人和聚焦样式。
- 代码：阵容候选每位置排序一次；移除重复替补排序；球员与联盟实力缓存纳入玩家属性变化。
- 缓存：版本请求先取精确缓存或在线新版，网络失败才回退其他查询版本；启动层注册新版 SW。
- 31 个静态检查通过，浏览器桌面/390/320 宽度与 Enter 选人通过。旧档数值与存档键保留。
- 当前页面/核心/样式标记为 `20261002-courtside-ui-v2`，启动层 `20261002-courtside-boot-v14`，缓存 `perfect-player-shell-20261002-courtside-ui-v26`。发布过程与引用边界见 `tools/artifacts/ui-release-notes.md`。

2026-10-02 头像与评分轮已完成，见 [修正与验证记录](tools/artifacts/avatar-rating-update.md)：

- 新增 188 张真人照片，另复用 1 个明确别名的已有照片；剩余 110 个姓名保留缩写并记录未解决原因。
- 修复透明照片与字母头像叠放；采用白底单图，顺次换源及失败兜底。
- 开局评分修复统一高分压缩及 84 分角色估计对球星统一扣分的偏差；三个年代 90+ 人数从 4/3/1 变为 16/12/17，现役仍为 22。
- 29 个静态测试、真实 Chrome 头像/评分检查及四年代 10,440 场模拟通过。未修改比赛常数或发布 GitHub。
- 新评分默认仅用于新开局；旧档数值保留。旧档头像可更新。未取得旧生涯数值迁移确认时不执行迁移。
- 当前评分 `20261001-season-stars-v5`、补图 `20261002-verified-headshots-v2`、缓存 `perfect-player-shell-20261002-avatars-ratings-v25`。

- 接管文件记录的线上 `main` 为 `196c5038cce9a59d3ee253fb5692e52298f5c2d6`，当时 Pages 构建成功；本轮未重新核对线上 SHA 与构建状态，也未发布。
- 本地 `.git` 不完整：分支名是 `master`、没有 remote、工作区文件均显示为未跟踪。不要依赖本地 `git diff` 判断改动范围，也不要直接 `git add .`。
- 接管前对 56 个主要 JS/JSON/CSS/HTML 文件做过 Git blob 对比，当时业务内容一致；本轮修改仅在本地，不能继续视为与线上一致。
- 其中 32 个文件原始哈希不同，但全部只是 CRLF/LF 换行差异，没有实质内容差异。后续提交不要制造整库换行符重写。
- 推荐在单独的正常 clone/worktree 中建立 Git 基线，或通过 GitHub API 精确提交审查过的文件；不要覆盖当前目录和存档。

## 8. 拟真升级路线

### P0：让基准可信

本轮已完成，证据见第 6 节和 `tools/artifacts/simulation-baseline.md`。没有重写正式随机系统或调整比赛参数。后续从 P1 继续；只有相关代码或数据变更时才重跑受影响的基线。

### P1：建立按年代校准的数据目标

至少覆盖：

- 球队：节奏、得分、失分、投篮/三分/罚球占比、助攻、篮板、抢断、盖帽、失误。
- 球员：分钟、使用率、出手、真实命中率或等效效率、得分/篮板/助攻分布。
- 阵容：当家球星、第二核心、普通首发、替补和边缘球员的分钟与球权差异。
- 季后赛：强弱队系列赛胜率、横扫/抢七比例、主场优势；不设置“总决赛强行五五开”。

目标值应按 2003-04、2010-11、2016-17 和现役分别取可追溯数据，不用同一组现代联盟均值覆盖所有年代。

### P2：球员身份化成长

1. 选择覆盖不同类型的金丝雀球员：早熟巨星、晚成巨星、长青巨星、短巅峰、普通首发、角色球员和高顺位水货。
2. 对每人记录 18/22/26/30/34/38 岁的 OVR 与核心属性分布。
3. 历史真实球员使用可追溯曲线；生成球员使用“潜力 + 峰值年龄 + 巅峰长度 + 波动 + 伤病”模型。
4. 在 UI 的球员档案或赛季报告中展示年度 OVR 变化及原因，让玩家看得见队友成长和衰退。

### P3：伤病、退役与阵容流动

- 伤病频率、赛季报销率和复发风险需要按年龄、负荷、续航与伤病史分层。
- 退役不能只看 OVR 或统一年龄；需要年龄、能力、伤病、角色和明确历史节点共同决定。
- 长期坐板凳的球员应通过合同、角色需求、交易和自由市场流动，而不是永远滞留原队。

### P4：有证据的代码瘦身

1. 先列出重复实现、无调用函数、永远不读的状态字段和已失效兼容层。
2. 每项删除都要给出调用搜索、测试覆盖和删除后的回归结果。
3. 优先整理模拟/成长的稳定边界；不要一次拆掉 19,000 行核心文件。
4. 不为了“现代化”引入 React、TypeScript、构建器或状态框架；只有现有浏览器脚本方式已成为可测瓶颈时再讨论迁移。

## 9. 可参考的 GitHub 项目与许可边界

| 项目 | 可借鉴点 | 许可边界 |
|---|---|---|
| [dhsa33/perfect-player](https://github.com/dhsa33/perfect-player) | 最接近的上游母版；截至检查时最新提交修复直播结束后的按钮可见性，并有 Service Worker 性能改进 | 仓库未声明标准许可证；默认只比较思路和差异，不直接复制新增代码/素材 |
| [zyz9408/perfect-player](https://github.com/zyz9408/perfect-player) | 更早的母版、现役评分和生涯系统演变 | 未声明标准许可证；同样先核实授权 |
| [zengm-games/zengm](https://github.com/zengm-games/zengm) | 客户端体育模拟、IndexedDB/缓存分层、长期联盟数据组织 | 自定义许可证明确声明“不是开源”；只借鉴公开设计思想，不能拿代码做竞争性可玩分支 |
| [liyangmj23-del/nba-career-sim](https://github.com/liyangmj23-del/nba-career-sim) | MIT；真实数据导入、假设生涯与可解释结果展示 | 技术栈不同；仅在确有帮助时复用算法，并保留许可证和署名 |
| [AlvaroRumpel/the_goat](https://github.com/AlvaroRumpel/the_goat) | 纯模拟引擎、注入式 seeded RNG、独立 calibration tests 的工程思路 | 未发现标准许可证，不复制实现；只借鉴“可复现模拟与校准测试”方法 |

GitHub 搜索不是“找到项目就粘代码”。每次引用前先检查许可证、最近维护时间、数据来源和是否真正解决当前问题。

## 10. 完成定义

每一轮修改都必须同时满足：

1. 明确改善了哪个可量化拟真指标。
2. 没有破坏旧档、现役/传奇模式、移动端和现有数据资源。
3. 新增或更新一个能捕获该问题的最小回归检查。
4. 相关静态测试与浏览器烟雾测试通过；已知失败必须单独说明。
5. 只提交实际修改文件，更新 HTML 查询版本和 `sw.js` 缓存版本。
6. 未经明确授权不上传 GitHub；发布后验证 `main`、Pages 构建和在线缓存版本。

