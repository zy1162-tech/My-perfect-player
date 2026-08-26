import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const start = core.indexOf('function normalizeScoringLineToPoints(');
const end = core.indexOf('/** 生成你的球员数据', start);
assert.ok(start >= 0 && end > start, 'production box-score synchronization source should be present');

const ctx = {
  Math,
  STATE:{ careerTeam:'A' },
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
vm.runInContext(core.slice(start, end), ctx);

function rows() {
  return [
    { name:'我', isUser:true, pts:20, fgm:7, fga:14, threeM:2, threeA:5, ftm:4, fta:5 },
    { name:'队友1', pts:24, fgm:9, fga:18, threeM:3, threeA:7, ftm:3, fta:4 },
    { name:'队友2', pts:20, fgm:7, fga:15, threeM:2, threeA:6, ftm:4, fta:5 },
    { name:'队友3', pts:18, fgm:7, fga:14, threeM:1, threeA:4, ftm:3, fta:4 },
    { name:'队友4', pts:14, fgm:5, fga:11, threeM:1, threeA:3, ftm:3, fta:4 }
  ];
}

function verify(teamScore, stats, expectedUserPoints) {
  const teamRows = rows();
  const game = { scoreA:teamScore, boxScore:{ A:teamRows } };
  ctx.syncUserStatsIntoBoxScore(game, stats);
  assert.equal(stats.pts, expectedUserPoints, 'returned stats should be constrained with the displayed line');
  assert.equal(teamRows[0].pts, expectedUserPoints);
  assert.equal(teamRows.reduce((sum, line) => sum + line.pts, 0), teamScore, 'team points must equal scoreboard');
  teamRows.forEach(line => {
    assert.ok(line.pts >= 0, `${line.name} cannot receive negative points`);
    assert.equal((line.fgm - line.threeM) * 2 + line.threeM * 3 + line.ftm, line.pts, `${line.name} scoring math must reconcile`);
    assert.ok(line.fgm <= line.fga, `${line.name} FGM cannot exceed FGA`);
    assert.ok(line.threeM <= line.threeA, `${line.name} 3PM cannot exceed 3PA`);
    assert.ok(line.ftm <= line.fta, `${line.name} FTM cannot exceed FTA`);
  });
}

verify(80, { pts:85, fgm:30, fga:48, threeM:7, threeA:15, ftm:18, fta:21, reb:8, ast:7, stl:1, blk:0, tov:3, mins:39 }, 80);
verify(80, { pts:80, fgm:28, fga:45, threeM:6, threeA:14, ftm:18, fta:20, reb:8, ast:7, stl:1, blk:0, tov:3, mins:39 }, 80);
verify(80, { pts:0, fgm:0, fga:9, threeM:0, threeA:3, ftm:0, fta:0, reb:4, ast:3, stl:0, blk:0, tov:1, mins:18 }, 0);

console.log('Box-score sync boundary checks passed: 85→80 clamp, exact-score, and zero-line cases reconcile.');
