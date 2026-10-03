# 2026-10-04 阵容与 PC 生涯界面交付

建球阶段曾优先读取独立的旧球员池，比赛阶段读取更新后的联盟，导致同一球员在不同界面出现不同球队。现在建球、轮换和比赛统一读取当季联盟；旧池只补充照片、中文名和独立的队史惊喜卡。

## 名单来源与边界

| 开局 | 球队 | 球员 | 归属基准 | 标注估值的球员 |
|---|---:|---:|---|---:|
| 现代 2026-27 | 30 | 620 | NBA 官网 2026-10-03 训练营阵容 | 153 |
| 2003-04 | 29 | 424 | RealGM 开赛日名单 | 68 |
| 2010-11 | 30 | 436 | RealGM 开赛日名单 | 63 |
| 2016-17 | 30 | 450 | RealGM 开赛日名单 | 89 |

现代逐队来源保存在 [官网名单快照](current-roster-reference-20261003.json)。历史来源为 [网页参考](historical-opening-roster-reference.json)、[Chrome 可见名单记录](historical-opening-browser-reference.json) 和 [对应来源链接](historical-opening-browser-sources.json)。合并后的 89 个来源也保存在正式年代数据中。

例如杰伦·布朗现在只在 PHI 的普通开局池出现，BOS 普通池中没有他。[NBA 官方交易记录](https://www.nba.com/news/2026-offseason-trade-tracker) 和球队公开阵容用于核对转会事实。队史惊喜属于另一种卡片，保留自己的身份标记。

现代是训练营快照，包含试训、双向及边缘名单，后续裁员还会变化。没有完整赛季统计样本的新秀和新增球员保留“估算”标记，未宣称为官方 2K 评分。历史新增边缘球员同样标注资料不足估值；名册来源只证明归属，不证明评分或未知年龄。

2003 年开局删除未来的夏洛特阵容；2004 年加入历史扩军名单。2003 年的新奥尔良属于东部，次年改为西部。29 队采用模拟赛程：每队 82 场、41 主场和 41 客场，无同日重复比赛；不宣称复刻当年真实日期。

旧档保留已经发生的模拟交易、能力和财务记录。新增可选的 `leagueTeams` 存档字段保存活跃球队列表；旧格式从自己的非空球队名单推断，未重写为现实世界的新阵容。

## 界面与功能

主菜单采用竞技篮球游戏的人物舞台、深色球馆和明确的模式入口；赛前放大真实球员白底照片与虚拟主角图片，操作按钮在长窗口中保持可见。赛季面板显示真实轮换计划、模拟伤病风险、默契、余额，并接入已有成长、教练和账本功能。

技能面板复核发现旧文字颜色在深色背景上不可读，已在原样式定义中改为共用主题变量，同时修正成就和传承面板，桌面技能列表采用双列。人物画面参考 [NBA 2K27 官方 PC 展示](https://store.steampowered.com/app/4356430/NBA_2K27/) 的篮球人物和球馆呈现，具体页面布局为本项目实现。

虚拟形象使用内置 imagegen 生成，路径为 `assets/images/ui/career-avatar-v1.png`，1024 × 1536，透明背景。提示词要点：成年东亚男性篮球后卫、海军蓝红边 1 号球衣、持球站姿、写实体育游戏 3D 渲染风格、全身透明切图；不是任何真实球员。它是图片，尚未实现可转动的实时三维模型。

## 已执行验证

- 35 个 `tools/test-*.mjs` 全部通过。新增名单检查以独立采集记录核对 620 名现代球员和 89 支历史球队，错误归属、遗漏和重复均为 0。
- 29 队完整联盟赛程实际模拟后，各队胜负合计 82，联盟胜场总数为 1,189；2004 扩军、后续生成新秀、模式切换和历史球队列表存读档通过。
- 实际比赛入口检查重复启动、重复结果回调与读档前旧回调，不重复记录数据和工资。模拟失败保留未完成场次并提供重试。
- Chrome 中费城建球名单显示布朗 OVR 93，波士顿没有他；真人头像仍为白底。
- Chrome 观看比赛后确认终场，再继续直接模拟：前三场为 20、22、22 分钟；接受三场试用后，计划从 23 变为 29 分钟，后三场为 28、28、29 分钟，合计 85 分钟。结束后临时效果清除并反馈 3/3 场达标。效果生效期间存读档，角色、余额、任务与效果一致。
- Chrome 实际选择拍摄获得 US$180,000，再支付 US$35,000 团队活动费用，余额 US$145,000；两次团队选择把默契提高至 6，建议七秒进攻教练成功，教练记录与真实球队体系一致，本赛季第二次建议被次数规则限制。
- Chrome 已打开成长、教练和账本入口，账本显示上述实际收支、合同年薪与教练。执行检查覆盖五种教练体系在直接及观看引擎中的作用，恢复分钟上限、技能资源和旧剧情选项。
- 在同一笔已赚余额上准备恢复选择：三场限时把计划压至 22 分钟、风险由 0.6% 降至 0%；真实直接与观看引擎分别输出 22 / 19 分钟。随后私人恢复选择扣 US$75,000，余额由 US$145,000 变为 US$70,000、累计支出 US$110,000。此项用于检查选项及账本调用，并未声称自然游玩已走完恢复剧情。
- 默认桌面、1440 PC 以及 390 / 320 外框宽度使用正式页面实际渲染，窄屏没有水平溢出；赛前按钮可用，技能名称颜色复核为 `rgb(237, 243, 255)`。

这些检查覆盖本轮受影响调用链，不代表整个生涯中所有随机剧情都已逐一人工玩过。浏览器安全策略阻止截图下载页面的导出，已完成实际画面核验。

## 虚拟形象生成记录

使用内置 imagegen，透明背景，新生成一张图片。最终文件为 `assets/images/ui/career-avatar-v1.png`。完整提示词如下：

```text
Use case: stylized-concept.
Asset type: transparent full-body fictional basketball player cutout for a PC-style basketball career simulation website.
Subject: one fictional adult male basketball guard, age about 23, athletic East Asian appearance, completely invented and not resembling a real athlete. Wearing a premium dark midnight-navy sleeveless basketball uniform with restrained crimson and white edge trim, plain number 1, no logos or other words. White basketball shoes. Holds one orange basketball casually against his hip. Calm focused confident expression, standing balanced, natural athletic proportions and anatomically accurate hands.
Style: high-end realistic 3D sports-game character render, detailed fabric mesh and convincing skin texture, polished but human. Strong clean studio key light from above-left, subtle cool cyan edge light on the right, restrained warm fill, suitable for a dark arena UI. This is an original fictional avatar, not a photo or recreation of any NBA player.
Composition: full body from head to shoes, front three-quarter view, centered, vertical framing, entire silhouette and basketball visible, modest empty margin, asset fills most of frame. No cropping of head or feet. Uniform number clearly 1. No scene, no arena, no floor, no props besides basketball. Truly transparent alpha background, no white/gray/checkerboard backdrop. No text outside uniform number, no watermark, no branding.
```
