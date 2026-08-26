import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const start = core.indexOf('function getSimPrimaryPosition(');
const end = core.indexOf('/** 属性→效率系数', start);
assert.ok(start >= 0 && end > start, 'box-score generator source should be present');
const creationStart = core.indexOf('function calcPlayerCreationRating(');
const creationEnd = core.indexOf('function getPlayerRotationMinutes(', creationStart);
assert.ok(creationStart >= 0 && creationEnd > creationStart, 'creation rating source should be present');

function player(name, ovr, offense, pos) {
  return {
    name, cname:name, ovr, pos,
    threePT:offense, MID:offense - 2, FIN:offense - 1, DNK:offense - 5,
    HAN:offense, PAS:Math.max(58, offense - 8), CLU:offense,
    REB:pos === 'C' ? 88 : 62, PDEF:72, IDEF:70, BLK:pos === 'C' ? 84 : 55, ATH:76, STR:74
  };
}

let roster = [
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
  softCap99:value => Math.min(99, Number(value) || 0),
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
vm.runInContext(core.slice(start, end) + '\n' + core.slice(creationStart, creationEnd), ctx);

let starAttempts = 0;
let starLowGames = 0;
let starHighGames = 0;
let hotBenchGames = 0;
let made = 0;
let attemptsTotal = 0;
let ftMade = 0;
let ftAttempts = 0;
for (let game = 0; game < 1200; game++) {
  const box = ctx.generateBoxScore('A', 'B', 116, 112).A;
  const star = box.find(line => line.name === '当家球星');
  const bench = box.filter(line => ['第六人','替补二','替补三','替补四','替补五'].includes(line.name));
  starAttempts += star.fga;
  if (star.fga <= 15) starLowGames++;
  if (star.fga >= 20) starHighGames++;
  if (Math.max(...bench.map(line => line.fga)) >= 12) hotBenchGames++;
  const teamFga = box.reduce((sum, line) => sum + line.fga, 0);
  const teamFgm = box.reduce((sum, line) => sum + line.fgm, 0);
  const teamPts = box.reduce((sum, line) => sum + line.pts, 0);
  made += teamFgm;
  attemptsTotal += teamFga;
  ftMade += box.reduce((sum, line) => sum + line.ftm, 0);
  ftAttempts += box.reduce((sum, line) => sum + line.fta, 0);
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
const teamFgPct = made / attemptsTotal;
const averageFtm = ftMade / 1200;
const teamFtPct = ftMade / ftAttempts;
console.log(`Shot sample: star ${starAverage.toFixed(1)} FGA, low ${starLowGames}, 20+ ${starHighGames}, hot bench ${hotBenchGames}, FG ${(teamFgPct * 100).toFixed(1)}%, ${averageFtm.toFixed(1)} FTM.`);
assert.ok(starAverage >= 18 && starAverage <= 23, `star FGA average ${starAverage.toFixed(2)} should be realistic`);
assert.ok(starLowGames >= 15, 'stars should still have occasional low-attempt games');
assert.ok(starHighGames >= 700, 'stars should commonly reach 20 attempts');
assert.ok(hotBenchGames >= 20, 'hot bench players should sometimes earn 12+ attempts');
assert.ok(teamFgPct >= 0.43 && teamFgPct <= 0.505, `long-run team FG% ${(teamFgPct * 100).toFixed(1)}% should stay in a plausible range`);
assert.ok(averageFtm >= 12 && averageFtm <= 27, `average team FTM ${averageFtm.toFixed(1)} should stay plausible`);
assert.ok(teamFtPct >= 0.70 && teamFtPct <= 0.86, `team FT% ${(teamFtPct * 100).toFixed(1)}% should stay plausible`);

for (const score of [82, 94, 106, 128, 150]) {
  const pair = ctx.generateBoxScore('A', 'B', score, score + 1);
  for (const [team, expected] of [['A', score], ['B', score + 1]]) {
    assert.equal(pair[team].reduce((sum, line) => sum + line.pts, 0), expected, `${team} total should reconcile at ${expected}`);
    pair[team].forEach(line => {
      assert.ok(line.fgm <= line.fga && line.threeM <= line.threeA && line.ftm <= line.fta);
      assert.equal((line.fgm - line.threeM) * 2 + line.threeM * 3 + line.ftm, line.pts);
    });
  }
}

// 顶级低位中锋与优秀持球后卫共存：中锋应长期接近当家核心用量，
// 允许偶尔低出手，但不能频繁被分配成蓝领。
const shaq = {
  name:'鲨鱼型中锋', cname:'鲨鱼型中锋', ovr:98, pos:'C',
  threePT:32, MID:58, FIN:99, DNK:99, STR:99, HAN:74, PAS:72, CLU:91,
  REB:96, PDEF:67, IDEF:94, BLK:93, ATH:92
};
const guard = {
  name:'优秀后卫', cname:'优秀后卫', ovr:91, pos:'PG',
  threePT:91, MID:89, FIN:88, DNK:76, STR:70, HAN:94, PAS:92, CLU:91,
  REB:58, PDEF:79, IDEF:56, BLK:45, ATH:88
};
roster = [
  guard, player('优秀分卫', 87, 87, 'SG'), player('侧翼', 82, 79, 'SF'), player('大前锋', 81, 76, 'PF'), shaq,
  player('第六人2', 80, 81, 'SG'), player('替补控卫', 75, 73, 'PG'), player('替补侧翼', 73, 70, 'SF'),
  player('替补大前', 71, 66, 'PF'), player('替补中锋', 69, 63, 'C')
];
let shaqFga = 0;
let shaqLow = 0;
let guardFga = 0;
for (let game = 0; game < 1600; game++) {
  const box = ctx.generateBoxScore('A', 'B', 116, 112).A;
  const shaqLine = box.find(line => line.name === '鲨鱼型中锋');
  const guardLine = box.find(line => line.name === '优秀后卫');
  shaqFga += shaqLine.fga;
  guardFga += guardLine.fga;
  if (shaqLine.fga <= 13) shaqLow++;
  assert.equal(box.reduce((sum, line) => sum + line.pts, 0), 116);
  box.forEach(line => assert.equal((line.fgm - line.threeM) * 2 + line.threeM * 3 + line.ftm, line.pts));
}
const shaqAverage = shaqFga / 1600;
const guardAverage = guardFga / 1600;
assert.ok(shaqAverage >= 17 && shaqAverage <= 21.5, `Shaq-like C average ${shaqAverage.toFixed(2)} FGA should be a primary option`);
assert.ok(shaqLow / 1600 <= 0.12, `Shaq-like C low-attempt rate ${(shaqLow / 16).toFixed(1)}% should not resemble a role player`);
assert.ok(shaqAverage >= guardAverage - 1.5, `Shaq-like C ${shaqAverage.toFixed(1)} should stay near elite guard ${guardAverage.toFixed(1)}`);

console.log(`Shot distribution checks passed: lead guard ${starAverage.toFixed(1)} FGA; Shaq-like C ${shaqAverage.toFixed(1)} vs guard ${guardAverage.toFixed(1)}.`);
