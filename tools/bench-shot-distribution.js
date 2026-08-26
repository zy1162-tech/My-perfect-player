/**
 * 出手分布基准测试（无浏览器）。
 * 直接从发布文件里抽取真实函数（brace-matching），在 Node vm 沙箱中运行：
 *   - live-sim 的 pickShooter（文字直播逐回合出手人）
 *   - core 的 generateBoxScore（跳过模拟技术统计）
 * 对比旧公式（legacy 镜像）与新公式（位置加权得分威胁），
 * 验证：高评级强力中锋不再蓝领化；防守型蓝领中锋仍然蓝领。
 *
 * Usage: node tools/bench-shot-distribution.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LIVE_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'perfect-player-live-sim.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'perfect-player-core.js'), 'utf8');

/* ---------- 1. 从真实源码中按花括号配对抽取顶层函数 ---------- */
function extractFunction(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error('function not found in source: ' + name);
  let i = src.indexOf('{', idx);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(idx, i + 1);
}

const LIVE_FNS = [
  'rand', 'chance', 'clamp', 'attr', 'ovrOf', 'posOf', 'pid', 'skill01', 'effectiveAttr',
  'pickWeighted', 'creationOf', 'scoringThreatOf', 'shotPriorityOf',
  'userLiveScoringScale', 'shotFormFor', 'pickShooter',
  'remainingMins', 'remainingPossFor', 'neededPPP'
];
const CORE_FNS = [
  'softCap99', 'simSkill01', 'getSimPrimaryPosition', 'allocateIntegerTotal',
  'positionScoringRating', 'shotPriorityRating', 'calcPlayerCreationRating', 'generateBoxScore'
];

const scriptParts = [];
LIVE_FNS.forEach(function (n) { scriptParts.push(extractFunction(LIVE_SRC, n)); });
CORE_FNS.forEach(function (n) { scriptParts.push(extractFunction(CORE_SRC, n)); });

/* ---------- 2. 旧公式镜像（legacy，仅用于对比展示，不参与断言） ---------- */
scriptParts.push(`
function legacyPickWeights(court) {
  var out = [];
  for (var i = 0; i < court.length; i++) {
    var p = court[i];
    var rank = court.slice().sort(function(a, b) { return (creationOf(b) + ovrOf(b) * 0.20) - (creationOf(a) + ovrOf(a) * 0.20); }).indexOf(p);
    var role = [1.52, 1.20, 1.00, 0.86, 0.76][rank] || 0.70;
    out.push({ p: p, w: Math.pow(skill01(creationOf(p)), 1.95) * (0.28 + ovrOf(p) / 115) * role });
  }
  return out;
}
function legacyBoxWeights(players, mins) {
  var profiles = players.map(function(player, i) {
    var offense = (parseInt(player.threePT)||50) * 0.24 + (parseInt(player.MID)||50) * 0.18 +
      (parseInt(player.FIN)||50) * 0.28 + (parseInt(player.DNK)||50) * 0.08 +
      (parseInt(player.HAN)||50) * 0.14 + (parseInt(player.PAS)||50) * 0.08;
    var creation = offense * 0.58 + (parseInt(player.HAN)||50) * 0.27 + (parseInt(player.CLU)||50) * 0.15;
    return { player: player, mins: mins[i], creation: creation, offense: offense, hierarchyRank: -1 };
  });
  var hierarchy = profiles.slice().sort(function(a, b) {
    var aScore = a.creation * 0.68 + a.offense * 0.22 + (parseInt(a.player.ovr) || 50) * 0.10;
    var bScore = b.creation * 0.68 + b.offense * 0.22 + (parseInt(b.player.ovr) || 50) * 0.10;
    return bScore - aScore;
  });
  profiles.forEach(function(profile) { profile.hierarchyRank = hierarchy.indexOf(profile); });
  return profiles.map(function(profile) {
    var role = [1.30, 1.18, 1.06, 0.96, 0.88][profile.hierarchyRank] || 0.82;
    var skill = 0.30 + Math.pow(simSkill01(profile.creation), 1.85) * 1.75;
    return { p: profile.player, w: profile.mins * skill * role };
  });
}
`);

/* 权重数组 → 各球员占比（主进程侧工具函数） */
function shareOf(weights) {
  var total = 0, out = {}, i;
  for (i = 0; i < weights.length; i++) total += weights[i].w;
  for (i = 0; i < weights.length; i++) out[weights[i].p.name] = weights[i].w / total;
  return out;
}

/* ---------- 3. 沙箱与桩 ---------- */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildContext(seed, lineups, randomImpl) {
  const math = {};
  Object.getOwnPropertyNames(Math).forEach(function (k) {
    const d = Object.getOwnPropertyDescriptor(Math, k);
    if (d && 'value' in d) math[k] = d.value;
  });
  // 默认用种子 LCG；传 randomImpl 可覆盖（如 box 引擎用 0.5 使手感恒为 1.0）。
  math.random = randomImpl || makeRng(seed);
  const ctx = {
    Math: math,
    parseInt: parseInt, parseFloat: parseFloat, Number: Number, String: String,
    JSON: JSON, Object: Object, Array: Array, Boolean: Boolean,
    isFinite: isFinite, Infinity: Infinity, NaN: NaN,
    USER_PLAYER_SCORING_SCALE: 0.85,
    simGaussian: function (mean) { return mean; }, // 确定性：直接取均值
    sampleBinomial: function (n, p) { return Math.round(n * p); },
    calcTeamLineup: function (team) { return lineups[team]; }
  };
  vm.createContext(ctx);
  vm.runInContext(scriptParts.join('\n'), ctx);
  return ctx;
}

/* ---------- 4. 场景数据 ---------- */
const BENCH_PLAYERS = [
  { name: 'B-PG', pos: 'PG', ovr: 72, threePT: 74, MID: 66, FIN: 60, DNK: 45, HAN: 78, PAS: 74, STR: 50, CLU: 66 },
  { name: 'B-SG', pos: 'SG', ovr: 71, threePT: 76, MID: 64, FIN: 58, DNK: 50, HAN: 74, PAS: 62, STR: 52, CLU: 64 },
  { name: 'B-SF', pos: 'SF', ovr: 73, threePT: 68, MID: 68, FIN: 68, DNK: 65, HAN: 70, PAS: 60, STR: 60, CLU: 68 },
  { name: 'B-PF', pos: 'PF', ovr: 72, threePT: 50, MID: 60, FIN: 70, DNK: 72, HAN: 55, PAS: 54, STR: 78, CLU: 62 },
  { name: 'B-C', pos: 'C', ovr: 71, threePT: 35, MID: 56, FIN: 68, DNK: 70, HAN: 48, PAS: 50, STR: 82, CLU: 60, REB: 82, BLK: 78 }
];

const GUARDS_WINGS = [
  { name: 'PG', pos: 'PG', ovr: 84, threePT: 80, MID: 74, FIN: 70, DNK: 55, HAN: 88, PAS: 85, STR: 55, CLU: 78 },
  { name: 'SG', pos: 'SG', ovr: 82, threePT: 85, MID: 72, FIN: 68, DNK: 60, HAN: 84, PAS: 72, STR: 56, CLU: 76 },
  { name: 'SF', pos: 'SF', ovr: 85, threePT: 76, MID: 80, FIN: 80, DNK: 75, HAN: 80, PAS: 72, STR: 66, CLU: 82 },
  { name: 'PF', pos: 'PF', ovr: 80, threePT: 62, MID: 68, FIN: 76, DNK: 82, HAN: 60, PAS: 60, STR: 86, CLU: 70 }
];

const SCENARIOS = [
  {
    id: 'A', title: '精英进攻中锋队（90 OVR 强力中锋，队内第一人）',
    starters: GUARDS_WINGS.concat([
      { name: 'C', pos: 'C', ovr: 90, threePT: 50, MID: 78, FIN: 92, DNK: 88, HAN: 60, PAS: 62, STR: 90, CLU: 80, REB: 92, BLK: 85 }
    ]),
    checks: [
      { label: 'box 中锋出手占比 >= 18%', test: (r) => r.boxNew.C >= 0.18 },
      { label: 'box 中锋是前二选择', test: (r) => r.boxRank.C <= 1 },
      { label: 'live 中锋出手占比 >= 20%', test: (r) => r.liveNew.C >= 0.20 },
      { label: 'live 中锋是前二选择', test: (r) => r.liveRank.C <= 1 },
      { label: '旧公式 box 中锋占比应更低（证明修复生效）', test: (r) => r.boxNew.C > r.boxLegacy.C + 0.02 }
    ]
  },
  {
    id: 'B', title: '防守蓝领中锋队（85 OVR 护筐型中锋，进攻手段有限）',
    starters: GUARDS_WINGS.concat([
      { name: 'C', pos: 'C', ovr: 85, threePT: 30, MID: 52, FIN: 60, DNK: 74, HAN: 48, PAS: 52, STR: 92, CLU: 58, REB: 99, BLK: 96 }
    ]),
    checks: [
      { label: '蓝领中锋仍是全队最低出手（live）', test: (r) => Math.min(...Object.values(r.liveNew)) === r.liveNew.C },
      { label: '蓝领中锋 box 占比 <= 13%', test: (r) => r.boxNew.C <= 0.13 },
      { label: '后卫/侧翼仍是主要出手点', test: (r) => (r.liveNew.PG + r.liveNew.SG + r.liveNew.SF) >= 0.60 }
    ]
  },
  {
    id: 'C', title: '均衡平民队（五个 78-80 OVR）',
    starters: [
      { name: 'PG', pos: 'PG', ovr: 79, threePT: 76, MID: 70, FIN: 62, DNK: 50, HAN: 80, PAS: 80, STR: 52, CLU: 72 },
      { name: 'SG', pos: 'SG', ovr: 78, threePT: 80, MID: 68, FIN: 60, DNK: 55, HAN: 76, PAS: 64, STR: 54, CLU: 70 },
      { name: 'SF', pos: 'SF', ovr: 80, threePT: 70, MID: 72, FIN: 72, DNK: 68, HAN: 72, PAS: 66, STR: 62, CLU: 74 },
      { name: 'PF', pos: 'PF', ovr: 78, threePT: 55, MID: 64, FIN: 74, DNK: 76, HAN: 58, PAS: 58, STR: 82, CLU: 68 },
      { name: 'C', pos: 'C', ovr: 80, threePT: 40, MID: 62, FIN: 78, DNK: 80, HAN: 52, PAS: 55, STR: 86, CLU: 70, REB: 88, BLK: 85 }
    ],
    checks: [
      { label: '每个首发 live 占比都在 7%~35%', test: (r) => Object.values(r.liveNew).every((v) => v >= 0.07 && v <= 0.35) },
      { label: '中锋没有消失（>= 9%）', test: (r) => r.liveNew.C >= 0.09 }
    ]
  }
];

/* ---------- 5. 运行 ---------- */
const LIVE_TRIALS = 400000;

function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }

function runScenario(scenario, index) {
  const starters = scenario.starters;
  const lineupHome = {
    starters: { PG: starters[0], SG: starters[1], SF: starters[2], PF: starters[3], C: starters[4] },
    bench: BENCH_PLAYERS.slice(),
    allPlayers: starters.concat(BENCH_PLAYERS)
  };
  const lineupAway = { starters: {}, bench: [], allPlayers: [] };
  const lineups = { HOME: lineupHome, AWAY: lineupAway };
  // 两个独立沙箱：出手采样用种子 LCG；box 引擎用 0.5 使手感恒为 1.0（完全确定性）。
  const pickCtx = buildContext(1234 + index, lineups, null);
  const boxCtx = buildContext(5678 + index, lineups, function () { return 0.5; });

  // —— 文字直播：真实 pickShooter，大量采样 ——
  // 预置中性手感（form=1），让测试聚焦于出手分配逻辑而非手气波动。
  const court = starters;
  const game = { shotForms: {} };
  court.forEach(function (p) { game.shotForms[p.name] = 1; });
  pickCtx.__court = court;
  pickCtx.__game = game;
  const liveCounts = {};
  court.forEach(function (p) { liveCounts[p.name] = 0; });
  for (let i = 0; i < LIVE_TRIALS; i++) {
    const shooter = vm.runInContext('pickShooter(__court, false, 0, false, __game)', pickCtx);
    liveCounts[shooter.name]++;
  }
  const liveNew = {};
  court.forEach(function (p) { liveNew[p.name] = liveCounts[p.name] / LIVE_TRIALS; });

  // —— 文字直播：旧公式镜像 ——
  const legacyPick = shareOf(vm.runInContext('legacyPickWeights(__court)', pickCtx));

  // —— 跳过模拟：真实 generateBoxScore ——
  const boxRows = vm.runInContext('generateBoxScore("HOME", "AWAY", 112, 110)["HOME"]', boxCtx);
  const boxMap = {};
  boxRows.forEach(function (row) { boxMap[row.name] = row; });
  const teamFga = boxRows.reduce(function (s, r) { return s + r.fga; }, 0);
  const boxNew = {};
  starters.forEach(function (p) {
    boxNew[p.name] = (boxMap[p.name] ? boxMap[p.name].fga : 0) / Math.max(1, teamFga);
  });

  // —— 跳过模拟：旧公式镜像（用与真实一致的分钟数） ——
  const mins = starters.map(function (p) { return boxMap[p.name] ? boxMap[p.name].mins : 0; });
  boxCtx.__mins = mins;
  boxCtx.__starters = starters;
  const boxLegacy = shareOf(vm.runInContext('legacyBoxWeights(__starters, __mins)', boxCtx));

  function rankOf(shareMap) {
    const order = starters.slice().sort(function (a, b) { return shareMap[b.name] - shareMap[a.name]; });
    const out = {};
    order.forEach(function (p, i) { out[p.name] = i; });
    return out;
  }

  const result = {
    liveNew: liveNew,
    liveLegacy: legacyPick,
    boxNew: boxNew,
    boxLegacy: boxLegacy,
    liveRank: rankOf(liveNew),
    boxRank: rankOf(boxNew),
    boxFga: boxMap
  };

  // 输出
  console.log('');
  console.log('═'.repeat(78));
  console.log('场景 ' + scenario.id + '：' + scenario.title);
  console.log('─'.repeat(78));
  const header = [
    ['球员', 8],
    ['POS', 4],
    ['OVR', 4],
    ['live旧', 7],
    ['live新', 7],
    ['box旧', 7],
    ['box新', 7],
    ['boxFGA', 7]
  ];
  console.log(header.map(function (h) { return h[0].padEnd(h[1]); }).join(''));
  starters.forEach(function (p) {
    const fga = result.boxFga[p.name] ? result.boxFga[p.name].fga : 0;
    console.log(
      p.name.padEnd(8) +
      p.pos.padEnd(4) +
      String(p.ovr).padEnd(4) +
      fmtPct(result.liveLegacy[p.name]).padEnd(7) +
      fmtPct(result.liveNew[p.name]).padEnd(7) +
      fmtPct(result.boxLegacy[p.name]).padEnd(7) +
      fmtPct(result.boxNew[p.name]).padEnd(7) +
      String(fga).padEnd(7)
    );
  });

  // 断言
  const failures = [];
  scenario.checks.forEach(function (check) {
    const ok = check.test(result);
    if (!ok) failures.push(check.label);
    console.log((ok ? '  ✔ ' : '  ✘ ') + check.label);
  });
  return failures;
}

let allFailures = [];
SCENARIOS.forEach(function (scenario, index) {
  allFailures = allFailures.concat(runScenario(scenario, index));
});

console.log('');
console.log('═'.repeat(78));
console.log('【附加检查】比分节奏（1分惜败/剧本式绝杀修复的回归护栏）');
console.log('─'.repeat(78));

/* ---------- 6. 比分节奏回归检查 ---------- */
function steeringChecks() {
  const ctx = buildContext(9000, {}, null);
  ctx.__steerGame = {
    bp: { pace: 100, _gameMins: 48, _quarterSec: 720 },
    tgtA: 115, tgtB: 110, scoreA: 100, scoreB: 41.25, otA: 0, otB: 0, thisOtA: 9, thisOtB: 9
  };
  const checks = [
    {
      label: '末节最后5秒落后3分：neededPPP 被限制在 <=1.65（旧版 2.35 → 命中率 +0.60 制造剧本绝杀）',
      ok: (function () {
        const e = vm.runInContext('neededPPP(__steerGame, { side:"A", q:4, secLeft:5, isOT:false })', ctx);
        const boost = (Math.min(e, 1.65) - 1.154) * 0.24;
        return e <= 1.650001 && boost <= 0.12;
      })()
    },
    {
      label: '第二节正常节奏：neededPPP ≈ 1.10（该队目标效率，不给任何一方无端加成）',
      ok: (function () {
        const e = vm.runInContext('neededPPP(__steerGame, { side:"B", q:2, secLeft:360, isOT:false })', ctx);
        return Math.abs(e - 1.10) < 0.03;
      })()
    },
    {
      label: '加时赛钳制仍为 [0.35, 2.2]（OT 行为不被误伤）',
      ok: (function () {
        const e = vm.runInContext('neededPPP(__steerGame, { side:"A", q:4, secLeft:60, isOT:true })', ctx);
        return e <= 2.200001 && e >= 0.349999;
      })()
    },
    {
      label: 'live-sim 出手修正增益已改为对称小增益 0.24（旧版 0.50/0.44）',
      ok: /pct \+= \(e - 1\.154\) \* 0\.24;/.test(LIVE_SRC) && !/e >= 1\.154 \? 0\.50 : 0\.44/.test(LIVE_SRC)
    },
    {
      label: 'live-sim 末段钳制已收紧为 [0.60, 1.65]（旧版 0.25~2.35）',
      ok: /lo = 0\.60; hi = 1\.65;/.test(LIVE_SRC) && !/lo = 0\.25; hi = 2\.35;/.test(LIVE_SRC)
    },
    {
      label: '跳过模拟每场得分波动 σ 已放宽到 9.5（旧版 6.4）',
      ok: /9\.5 \+ modA\.variance/.test(CORE_SRC) && !/6\.4 \+ modA\.variance/.test(CORE_SRC)
    },
    {
      label: '观看模拟蓝图每场得分波动 σ 已放宽到 9.5（旧版 6.4）',
      ok: /clamp\(9\.5 \+ \(modA\.variance \|\| 0\), 6\.5, 13\)/.test(LIVE_SRC) && !/clamp\(6\.4 \+ \(modA\.variance \|\| 0\), 4\.6, 10\)/.test(LIVE_SRC)
    }
  ];
  checks.forEach(function (c) {
    if (!c.ok) allFailures.push(c.label);
    console.log((c.ok ? '  ✔ ' : '  ✘ ') + c.label);
  });
}
steeringChecks();

console.log('');
console.log('═'.repeat(78));
if (allFailures.length === 0) {
  console.log('全部断言通过：高评级强力中锋获得合理出手，蓝领中锋保持蓝领；比分节奏不再被人为收紧。');
  console.log('（注：live旧/live新为逐回合采样占比，box旧/box新为跳过模拟 FGA 占比）');
  process.exit(0);
} else {
  console.log('失败断言：');
  allFailures.forEach(function (f) { console.log('  ✘ ' + f); });
  process.exit(1);
}
