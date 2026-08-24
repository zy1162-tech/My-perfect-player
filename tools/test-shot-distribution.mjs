import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const start = core.indexOf('function generateBoxScore(');
const end = core.indexOf('/** 属性→效率系数', start);
assert.ok(start >= 0 && end > start, 'box-score generator source should be present');

function player(name, ovr, offense, pos) {
  return {
    name, cname:name, ovr, pos,
    threePT:offense, MID:offense - 2, FIN:offense - 1, DNK:offense - 5,
    HAN:offense, PAS:Math.max(58, offense - 8), CLU:offense,
    REB:pos === 'C' ? 88 : 62, PDEF:72, IDEF:70, BLK:pos === 'C' ? 84 : 55, ATH:76
  };
}

const roster = [
  player('当家球星', 95, 96, 'PG'), player('二当家', 88, 88, 'SG'),
  player('首发三', 82, 80, 'SF'), player('首发四', 79, 74, 'PF'), player('首发五', 78, 70, 'C'),
  player('第六人', 80, 82, 'SG'), player('替补二', 74, 72, 'PG'), player('替补三', 72, 68, 'SF'),
  player('替补四', 70, 65, 'PF'), player('替补五', 68, 62, 'C')
];

let seed = 0x5f3759df;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const simMath = Object.create(Math);
simMath.random = random;
const ctx = {
  Math:simMath,
  calcTeamLineup:() => ({ starters:{ PG:roster[0], SG:roster[1], SF:roster[2], PF:roster[3], C:roster[4] }, bench:roster.slice(5) }),
  simGaussian:(mean, sd) => {
    const u = Math.max(1e-8, random());
    const v = Math.max(1e-8, random());
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
  },
  simSkill01:value => Math.max(0, (Math.min(99, Number(value) || 25) - 25) / 74),
  getSimPrimaryPosition:p => p.pos,
  sampleBinomial:(attempts, probability) => {
    let made = 0;
    for (let i = 0; i < Math.round(attempts); i++) if (random() < probability) made++;
    return made;
  },
  allocateIntegerTotal:(total, weights, minimums) => {
    total = Math.max(0, Math.round(total || 0));
    minimums = minimums || weights.map(() => 0);
    const out = minimums.map(value => Math.max(0, Math.round(value || 0)));
    let remaining = total - out.reduce((a, b) => a + b, 0);
    const sum = weights.reduce((a, b) => a + Math.max(0.0001, Number(b) || 0), 0);
    const raw = weights.map(value => remaining * Math.max(0.0001, Number(value) || 0) / sum);
    raw.forEach((value, i) => { const whole = Math.floor(value); out[i] += whole; remaining -= whole; });
    const order = raw.map((value, i) => ({ i, frac:value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remaining; i++) out[order[i % order.length].i]++;
    return out;
  }
};
vm.createContext(ctx);
vm.runInContext(core.slice(start, end), ctx);

let starAttempts = 0;
let starLowGames = 0;
let starHighGames = 0;
let hotBenchGames = 0;
for (let game = 0; game < 1200; game++) {
  const box = ctx.generateBoxScore('A', 'B', 116, 112).A;
  const star = box.find(line => line.name === '当家球星');
  const bench = box.filter(line => ['第六人','替补二','替补三','替补四','替补五'].includes(line.name));
  starAttempts += star.fga;
  if (star.fga <= 15) starLowGames++;
  if (star.fga >= 20) starHighGames++;
  if (Math.max(...bench.map(line => line.fga)) >= 12) hotBenchGames++;
  const teamFga = box.reduce((sum, line) => sum + line.fga, 0);
  const teamPts = box.reduce((sum, line) => sum + line.pts, 0);
  box.forEach(line => {
    assert.ok(line.fgm <= line.fga, `${line.name} field goals cannot exceed attempts`);
    assert.ok(line.threeM <= line.threeA, `${line.name} threes cannot exceed attempts`);
    assert.ok(line.ftm <= line.fta, `${line.name} free throws cannot exceed attempts`);
    assert.equal((line.fgm - line.threeM) * 2 + line.threeM * 3 + line.ftm, line.pts, `${line.name} scoring line must reconcile`);
  });
  assert.equal(teamPts, 116);
  assert.ok(teamFga >= 82 && teamFga <= 105);
}
const starAverage = starAttempts / 1200;
console.log(`Shot sample: star ${starAverage.toFixed(1)} FGA, low ${starLowGames}, 20+ ${starHighGames}, hot bench ${hotBenchGames}.`);
assert.ok(starAverage >= 18 && starAverage <= 23, `star FGA average ${starAverage.toFixed(2)} should be realistic`);
assert.ok(starLowGames >= 15, 'stars should still have occasional low-attempt games');
assert.ok(starHighGames >= 700, 'stars should commonly reach 20 attempts');
assert.ok(hotBenchGames >= 20, 'hot bench players should sometimes earn 12+ attempts');

console.log(`Shot distribution checks passed: star ${starAverage.toFixed(1)} FGA, low ${starLowGames}, 20+ ${starHighGames}, hot bench ${hotBenchGames}.`);
