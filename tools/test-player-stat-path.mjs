import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const syncStart = core.indexOf('function normalizeScoringLineToPoints(');
const syncEnd = core.indexOf('/** 生成你的球员数据', syncStart);
const statsStart = core.indexOf('function generatePlayerStatsNew(');
const statsEnd = core.indexOf('window.samplePerfectPlayerStatProfile', statsStart);
assert.ok(syncStart >= 0 && syncEnd > syncStart, 'user box-score sync source should be present');
assert.ok(statsStart >= 0 && statsEnd > statsStart, 'player stat generator source should be present');

let seed = 1;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const ctx = {
  Math,
  STATE:{ position:'PG', careerTeam:'A' },
  USER_PLAYER_SCORING_SCALE:0.85,
  SIM_CONFIG:{
    SHOT_DIST:{ PG:{ threePT:0.35, MID:0.25, FIN:0.25 } },
    SHOOTING:{
      threePT:{ min:0.22, max:0.435 }, MID:{ min:0.25, max:0.51 },
      FIN:{ min:0.35, max:0.73 }, FT:{ min:0.52, max:0.92 }
    }
  },
  getPlayerRotationMinutes:() => 36,
  calcPlayerCreationRating:attrs => attrs.HAN * 0.45 + attrs.PAS * 0.30 + attrs.threePT * 0.15 + attrs.CLU * 0.10,
  userProductionRating:value => value <= 92 ? value : 92 + (value - 92) * 0.24,
  userProductionSkill01:value => Math.max(0, ((value <= 92 ? value : 92 + (value - 92) * 0.24) - 25) / 74),
  simSkill01:value => Math.max(0, (Math.min(99, Number(value) || 25) - 25) / 74),
  getStyleSkillRoll:() => 1,
  getSimulationPowerBaseline:() => ({ defense:80 }),
  calcTeamLineup:() => null,
  simGaussian:(mean, sd) => {
    const u = Math.max(1e-8, random());
    const v = Math.max(1e-8, random());
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
  },
  getFanHomeFormBonus:() => 0,
  clampWithHalfOverflow:(value, lo, hi, hardMax) => {
    if (value <= hi) return Math.max(lo, value);
    return Math.min(hardMax, hi + (value - hi) * 0.5);
  },
  calcShotPct:(type, value, _score, pressure, form) => {
    const anchors = {
      threePT:[[25,.22],[50,.28],[70,.34],[85,.385],[99,.435]],
      MID:[[25,.25],[50,.33],[70,.40],[85,.455],[99,.51]],
      FIN:[[25,.35],[50,.48],[70,.58],[85,.66],[99,.73]],
      FT:[[25,.52],[50,.67],[70,.77],[85,.85],[99,.92]]
    }[type];
    const v = Math.max(25, Math.min(99, Number(value) || 50));
    let pct = anchors[anchors.length - 1][1];
    for (let i = 1; i < anchors.length; i++) {
      if (v <= anchors[i][0]) {
        const left = anchors[i - 1];
        const right = anchors[i];
        pct = left[1] + (right[1] - left[1]) * (v - left[0]) / (right[0] - left[0]);
        break;
      }
    }
    return pct - pressure * (type === 'FIN' ? 0.82 : type === 'MID' ? 0.92 : 1) + form;
  },
  dampenProductionSkill:() => 1,
  sampleBinomial:(attempts, probability) => {
    let made = 0;
    for (let i = 0; i < Math.round(attempts); i++) if (random() < probability) made++;
    return made;
  },
  samplePoisson:expected => {
    if (expected > 12) return Math.max(0, Math.round(ctx.simGaussian(expected, Math.sqrt(expected))));
    const limit = Math.exp(-Math.max(0, expected));
    let product = 1;
    let count = 0;
    do { count++; product *= random(); } while (product > limit && count < 40);
    return Math.max(0, count - 1);
  },
  getLegacySimulationEffects:() => ctx.legacyFx,
  legacyFx:{ assistWeight:1, turnoverRisk:1, reboundWeight:1 },
  allocateIntegerTotal:(total, weights) => {
    total = Math.max(0, Math.round(total));
    const safe = weights.map(value => Math.max(0.0001, Number(value) || 0));
    const sum = safe.reduce((a, b) => a + b, 0);
    const raw = safe.map(value => total * value / sum);
    const out = raw.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    const order = raw.map((value, i) => ({ i, frac:value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < left; i++) out[order[i % order.length].i]++;
    return out;
  }
};
vm.createContext(ctx);
vm.runInContext(core.slice(syncStart, syncEnd) + '\n' + core.slice(statsStart, statsEnd), ctx);

const attrs = {
  threePT:88, MID:85, FIN:84, DNK:76, HAN:90, PAS:92, CLU:88,
  REB:72, PDEF:78, IDEF:62, BLK:50, ATH:84, STR:74
};
const baseGame = { pace:99.4, scoreA:115, scoreB:108, teamB:{ power:{ defense:80 } } };

function sampleProfile(fx) {
  ctx.legacyFx = fx;
  seed = 0x4d595df4;
  const totals = { reb:0, ast:0, tov:0, fgm:0, fga:0 };
  const games = 5000;
  for (let i = 0; i < games; i++) {
    const stats = ctx.generatePlayerStatsNew(attrs, baseGame, false);
    for (const key of Object.keys(totals)) totals[key] += stats[key];
  }
  for (const key of Object.keys(totals)) totals[key] /= games;
  return totals;
}

const level0 = sampleProfile({ assistWeight:1, turnoverRisk:1, reboundWeight:1 });
const level5 = sampleProfile({ assistWeight:1.15, turnoverRisk:0.90, reboundWeight:1.25 });
assert.ok(level5.ast >= level0.ast * 1.10, `Lv5 assists ${level5.ast.toFixed(2)} should exceed baseline ${level0.ast.toFixed(2)}`);
assert.ok(level5.reb >= level0.reb * 1.18, `Lv5 rebounds ${level5.reb.toFixed(2)} should exceed baseline ${level0.reb.toFixed(2)}`);
assert.ok(level5.tov <= level0.tov * 0.96, `Lv5 turnovers ${level5.tov.toFixed(2)} should be below baseline ${level0.tov.toFixed(2)}`);
const userFgPct = level0.fgm / level0.fga;
assert.ok(userFgPct >= 0.45 && userFgPct <= 0.56, `quick-sim user FG% ${(userFgPct * 100).toFixed(1)}% should remain plausible for an elite player`);

ctx.legacyFx = { assistWeight:1.15, turnoverRisk:0.90, reboundWeight:1.25 };
seed = 0x1234abcd;
const syncedGame = {
  ...baseGame,
  boxScore:{
    A:[
      { name:'我', isUser:true, pts:20, fgm:7, fga:14, threeM:2, threeA:5, ftm:4, fta:5 },
      { name:'队友1', pts:30, fgm:11, fga:21, threeM:4, threeA:9, ftm:4, fta:5 },
      { name:'队友2', pts:25, fgm:9, fga:18, threeM:3, threeA:7, ftm:4, fta:4 },
      { name:'队友3', pts:22, fgm:8, fga:16, threeM:2, threeA:6, ftm:4, fta:5 },
      { name:'队友4', pts:18, fgm:7, fga:14, threeM:1, threeA:4, ftm:3, fta:4 }
    ]
  }
};
ctx.generatePlayerStatsNew(attrs, syncedGame, false);
assert.equal(syncedGame.boxScore.A.reduce((sum, line) => sum + line.pts, 0), syncedGame.scoreA);
syncedGame.boxScore.A.forEach(line => {
  assert.equal((line.fgm - line.threeM) * 2 + line.threeM * 3 + line.ftm, line.pts, `${line.name} synced scoring line should reconcile`);
  assert.ok(line.fgm <= line.fga && line.threeM <= line.threeA && line.ftm <= line.fta);
});
const syncedTeamFgm = syncedGame.boxScore.A.reduce((sum, line) => sum + line.fgm, 0);
const syncedTeamFga = syncedGame.boxScore.A.reduce((sum, line) => sum + line.fga, 0);
const syncedTeamFgPct = syncedTeamFgm / syncedTeamFga;
assert.ok(syncedTeamFgPct >= 0.40 && syncedTeamFgPct <= 0.54, `synced team FG% ${(syncedTeamFgPct * 100).toFixed(1)}% should remain plausible`);

function syncBoundaryCase(teamScore, stats, expectedUserPoints) {
  const rows = [
    { name:'我', isUser:true, pts:20, fgm:7, fga:14, threeM:2, threeA:5, ftm:4, fta:5 },
    { name:'队友1', pts:24, fgm:9, fga:18, threeM:3, threeA:7, ftm:3, fta:4 },
    { name:'队友2', pts:20, fgm:7, fga:15, threeM:2, threeA:6, ftm:4, fta:5 },
    { name:'队友3', pts:18, fgm:7, fga:14, threeM:1, threeA:4, ftm:3, fta:4 },
    { name:'队友4', pts:14, fgm:5, fga:11, threeM:1, threeA:3, ftm:3, fta:4 }
  ];
  const game = { scoreA:teamScore, boxScore:{ A:rows } };
  ctx.syncUserStatsIntoBoxScore(game, stats);
  assert.equal(stats.pts, expectedUserPoints, 'returned player stats should use the constrained scoring line');
  assert.equal(rows[0].pts, expectedUserPoints, 'user box-score row should use the constrained points');
  assert.equal(rows.reduce((sum, line) => sum + line.pts, 0), teamScore, 'team total should equal the scoreboard exactly');
  rows.forEach(line => {
    assert.ok(line.pts >= 0, `${line.name} points cannot be negative`);
    assert.equal((line.fgm - line.threeM) * 2 + line.threeM * 3 + line.ftm, line.pts, `${line.name} boundary scoring line should reconcile`);
    assert.ok(line.fgm <= line.fga && line.threeM <= line.threeA && line.ftm <= line.fta);
  });
}

syncBoundaryCase(80, { pts:85, fgm:30, fga:48, threeM:7, threeA:15, ftm:18, fta:21, reb:8, ast:7, stl:1, blk:0, tov:3, mins:39 }, 80);
syncBoundaryCase(80, { pts:80, fgm:28, fga:45, threeM:6, threeA:14, ftm:18, fta:20, reb:8, ast:7, stl:1, blk:0, tov:3, mins:39 }, 80);
syncBoundaryCase(80, { pts:0, fgm:0, fga:9, threeM:0, threeA:3, ftm:0, fta:0, reb:4, ast:3, stl:0, blk:0, tov:1, mins:18 }, 0);

console.log(`Player stat path passed: AST ${level0.ast.toFixed(2)}→${level5.ast.toFixed(2)}, REB ${level0.reb.toFixed(2)}→${level5.reb.toFixed(2)}, TOV ${level0.tov.toFixed(2)}→${level5.tov.toFixed(2)}, user FG ${(userFgPct * 100).toFixed(1)}%, synced team FG ${(syncedTeamFgPct * 100).toFixed(1)}%.`);
