# 头像与年代评分修正

本地验证记录：2026-10-02。此轮修改未发布 GitHub。

## 头像

有真人照片时使用纯白底，每次只显示一张照片。真实照片不再与姓名缩写或其他备用照片叠放；本地图片失败后依次尝试其他来源，全部失败才显示稳定缩写。相同头像重复渲染复用加载记录，旧请求不会覆盖后来更新的来源。

共检查 299 个缺少本地有效照片的姓名。NBA 官方目录和球员资料核对后导入 154 张；对仍缺图者检索 ESPN 资料链接，再取得 34 张。另通过明确别名复用 Michael Sweetney 的已有照片，共解决 189 个姓名，新增文件 188 张。公开检索、照片文件和保守的真人照片检查记录分别保存在 headshot-import-results.json 和 espn-headshot-import-results.json。

NBA 来源：当前球员与 [NBA Players](https://www.nba.com/players) 姓名和 ID 对照，退役球员再核对对应公开资料页。ESPN 来源按公开 NBA 球员资料链接的姓名匹配；不将同名、模糊搜索结果直接用作头像。Chrome 插件已实际用于检索及官方头像下载；首次图片导出异常慢，随后采用已核实的公开 CDN 链接批量下载。

仍有 110 个姓名未补齐。NBA 返回通用图、ESPN 图片已失效、检索覆盖不足和请求失败分别记录，不把这些情况写成球员没有照片。缩写头像继续作为兜底；虚构新秀不使用真人肖像。

## 评分

修正了两个共享偏差：80 分以上源评分被统一压缩；最高只能到 84 分的角色估计又对所有高分球员扣分。高分段现在保留其标尺，角色信号不能因自身上限而给球星统一扣分；明显跨赛季跃升使用当季锚点。

这些数值是本游戏的综合评级，采用现役一致的档位，并参考当季荣誉、角色与表现；不是声称 NBA 发布了这些 OVR，也没有把每位球员的生涯巅峰复制到每个年代。低分段、新秀档位和原始评分记录继续保留。

当季证据：[2010-11 NBA 官方最佳阵容公告](https://pr.nba.com/2010-11-all-nba-teams/)、[2016-17 NBA 官方最佳阵容公告](https://pr.nba.com/harden-james-westbrook-leonard-davis-named-2016-17-nba-first-team/)、[NBA 历届最佳阵容](https://www.nba.com/news/history-all-nba-teams)、[NBA MVP 记录](https://www.nba.com/news/history-mvp-award-winners)。

| 年代 | 修正前90分及以上 | 修正后90分及以上 |
|---|---:|---:|
| 2003-04 | 4 | 16 |
| 2010-11 | 3 | 12 |
| 2016-17 | 1 | 17 |
| 现役 | 22 | 22 |

| 球员与赛季 | 修正前 | 修正后 |
|---|---:|---:|
| 2003-04 加内特 | 89 | 97 |
| 2003-04 邓肯 | 91 | 96 |
| 2010-11 罗斯 | 84 | 94 |
| 2010-11 霍华德 | 85 | 95 |
| 2010-11 杜兰特 | 85 | 94 |
| 2010-11 诺维茨基 | 84 | 94 |
| 2010-11 库里 | 82 | 82 |
| 2016-17 库里 | 88 | 95 |
| 2016-17 哈登 | 87 | 96 |
| 2016-17 伦纳德 | 84 | 96 |
| 2016-17 詹姆斯 | 89 | 97 |

## 验证与使用范围

29 个 test-*.mjs 全部通过，包含新增的白底、顺次换源、失败兜底、重复加载与旧请求隔离检查。真实 Chrome 页面调用正式开局和头像函数，检查当季评分、真人照片解码、白底及虚构新秀隔离，已通过；画面已查看。可打开 tools/browser-avatar-rating-smoke.html 复核样例。

按原 P0 的种子、名单、2,610 场/年代及 32 次成长结算重新执行，共 10,440 场，得分与投篮守恒检查通过。原 P0 结果沿用已保存的 simulation-baseline.md，未重新计算旧代码。

| 年代 | 平均得分：旧 / 新 | 新得分 P10 / P50 / P90 | 新回合均值 | 新 FG% | 第一核心平均FGA | 替补平均FGA |
|---|---|---|---:|---:|---:|---:|
| 2003 | 116.03 / 116.01 | 103 / 116 / 129 | 99.45 | 49.45 | 19.12 | 3.83 |
| 2010 | 115.70 / 115.88 | 103 / 116 / 129 | 99.40 | 49.77 | 19.01 | 3.98 |
| 2016 | 116.02 / 115.81 | 103 / 116 / 129 | 99.33 | 49.34 | 18.59 | 3.96 |
| current | 115.61 / 115.61 | 102 / 116 / 129 | 99.44 | 48.70 | 19.30 | 3.78 |

本轮未调整比赛常数。四年代仍使用共同的现代回合与效率基线，因此这轮验证说明评分与头像修复没有造成总体得分失控，不代表年代节奏已校准。加时分钟、重复身份和异常年龄仍沿用 P0 的待处理记录。

新评分默认用于新开局；已经保存的生涯 OVR、属性、交易与比赛记录保留。头像显示和补图可作用于旧档。用户尚未确认校准旧生涯时，不执行数值迁移。

当前版本：评分 20261001-season-stars-v5；补图 20261002-verified-headshots-v2；缓存 perfect-player-shell-20261002-avatars-ratings-v25。

## 未补齐姓名

A.J. Guyton、A.J. Price、Aaron Gray、Acie Law、Adam Harrington、Alando Tucker、Alton Ford、Andray Blatche、Andris Biedriņš、Anthony Randolph、Antoine Rigaudeau、Art Long、Bernard Robinson、Brian Cook、Bryce Drew、Carlos Delfino、Cezary Trybański、Charles Smith、Charlie Bell、Chris Owens、Chris Quinn、Chris Richard、Corey Benjamin、Craig Smith、D.J. White、Daequan Cook、Dalibor Bagaric、Damion James、Damone Brown、Daniel Orton、Dean Oliver、Delonte West、Derrick Brown、Derrick Caracter、Dominic McGuire、Donté Greene、Dwayne Jones、Earl Clark、Eddie Griffin、Efthimi Rentzias、Eric Maynor、Francisco García、Glen Davis、Greg Oden、Greg Smith、Hamed Haddadi、Henry Walker、James Singleton、Jason Maxiell、Jeremy Richardson、Jermaine Jackson、Joey Graham、Johan Petro、John Amaechi、Jonny Flynn、Joseph Forte、Junior Harrington、Kenny Satterfield、Kevin Burleson、Kirk Haston、Kyrylo Fesenko、Lavor Postell、Lawrence Funderburke、Leon Powe、Lester Hudson、Linas Kleiza、Malik Hairston、Marcus Williams、Mardy Collins、Mateen Cleaves、Mengke Bateer、Mike Batiste、Nathan Jawai、Ndudi Ebi、Oliver Lafayette、Olumide Oyedeji、Oscar Torres、Othello Hunter、Patrick O'Bryant、Pepe Sánchez、Quinton Ross、Randolph Morris、Reggie Slater、Richie Frahm、Rick Brunson、Rodrigue Beaubois、Ronny Turiaf、Sam Young、Sean Lampley、Sean Marks、Sean May、Shannon Brown、Shavlik Randolph、Soumaila Samake、Stephen Graham、Taylor Griffin、Terence Morris、Terrence Williams、Tierre Brown、Tito Maddox、Torraye Braggs、Travis Diener、Trevon Scott、Trey Gilder、Troy Bell、Tyrus Thomas、Vincent Yarbrough、Walter Herrmann、Wang Zhizhi、Xavier Henry。

