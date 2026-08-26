import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const matchupStart = core.indexOf('function simulate82StyleMatchup(');
const matchupEnd = core.indexOf('function simulateGameNew(', matchupStart);
const contextStart = core.indexOf('function getPlayoffSeed(');
const contextEnd = core.indexOf('/** 单场模拟并更新简报', contextStart);
assert.ok(matchupStart >= 0 && matchupEnd > matchupStart, 'matchup engine source should be present');
assert.ok(contextStart >= 0 && contextEnd > contextStart, 'playoff home/seed helpers should be present');

let seed = 0x91e10da5;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const simMath = Object.create(Math);
simMath.random = random;
const powers = {
  // 轮换加权后的“四核心”队不会等于四名球星的个人 OVR；这里用主力抬高后
  // 的团队维度，弱队则对应轮换无人达到 80 的尺度。
  STRONG: { offense:85.5, defense:85.5, athletic:85, clutch:88, depth:87 },
  WEAK: { offense:79, defense:79, athletic:78, clutch:77, depth:79 }
};
const standings = {
  STRONG:{ wins:66, losses:16 },
  WEAK:{ wins:40, losses:42 },
  SAME_A:{ wins:45, losses:37 },
  SAME_B:{ wins:60, losses:22 }
};
const ctx = {
  Math:simMath,
  STATE:{
    careerTeam:'NONE',
    season:{
      standings:standings,
      playoffBracket:{ teams:[{team:'STRONG'},null,{team:'SAME_A'}] },
      otherBracket:{ teams:[null,null,{team:'SAME_B'},null,null,null,null,{team:'WEAK'}] }
    }
  },
  getConference:team => team === 'STRONG' ? 'EAST' : 'WEST',
  getConferenceSorted:conf => conf === 'EAST'
    ? [{team:'STRONG', wins:66, losses:16}]
    : [{team:'WEAK', wins:40, losses:42}],
  calcTeamPowerWithPlayer:team => powers[team],
  getSimulationPowerBaseline:() => ({ offense:80, defense:80, athletic:80, depth:80 }),
  getCareerTeamGameModifiers:() => ({ offense:0, defense:0, variance:0 }),
  simGaussian:(mean, sd) => {
    const u = Math.max(1e-8, random());
    const v = Math.max(1e-8, random());
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
  },
  splitRegulationScore:total => {
    const q = Math.floor(total / 4);
    return [q, q, q, total - q * 3];
  },
  generateBoxScore:() => ({ STRONG:[], WEAK:[] })
};
vm.createContext(ctx);
vm.runInContext(core.slice(matchupStart, matchupEnd) + '\n' + core.slice(contextStart, contextEnd), ctx);

const expectedPattern = [true, true, false, false, true, false, true];
const actualPattern = expectedPattern.map((_, game) => ctx.getPlayoffSeriesGameContext('STRONG', 'WEAK', game).teamAHome);
assert.deepEqual(actualPattern, expectedPattern, 'higher seed should host games 1, 2, 5, and 7');
const crossConference = ctx.getPlayoffSeriesGameContext('STRONG', 'WEAK', 0);
assert.equal(crossConference.seedA, 1);
assert.equal(crossConference.seedB, 8);
assert.ok(Math.abs(crossConference.seedBonus - 2.8) < 1e-9, 'cross-conference seed gap should use each team’s own conference seed');

const highHomePattern = [true, true, false, false, true, false, true];
const lowHomePattern = highHomePattern.map(value => !value);
let sameSeedPattern = highHomePattern.map((_, game) => ctx.getPlayoffSeriesGameContext('SAME_A', 'SAME_B', game).teamAHome);
assert.deepEqual(sameSeedPattern, lowHomePattern, 'same-seed team B with a 60-22 record should host games 1, 2, 5, and 7');
assert.equal(ctx.getPlayoffSeriesGameContext('SAME_A', 'SAME_B', 0).seedBonus, 0, 'same seeds should not receive seed bonus');
ctx.STATE.season.standings.SAME_A = { wins:61, losses:21 };
ctx.STATE.season.standings.SAME_B = { wins:45, losses:37 };
sameSeedPattern = highHomePattern.map((_, game) => ctx.getPlayoffSeriesGameContext('SAME_A', 'SAME_B', game).teamAHome);
assert.deepEqual(sameSeedPattern, highHomePattern, 'same-seed team A with the better record should host games 1, 2, 5, and 7');
ctx.STATE.season.standings.SAME_A = { wins:45, losses:37 };
ctx.STATE.season.standings.SAME_B = { wins:60, losses:22 };
ctx.STATE.season.standings = [
  { team:'SAME_A', w:62, l:20 },
  { team:'SAME_B', wins:44, losses:38 }
];
assert.equal(ctx.getPlayoffSeriesGameContext('SAME_A', 'SAME_B', 0).teamAHome, true, 'array standings with w/l aliases should also resolve home court');
ctx.STATE.season.standings = standings;

const lowSeedA = highHomePattern.map((_, game) => ctx.getPlayoffSeriesGameContext('WEAK', 'STRONG', game));
assert.deepEqual(lowSeedA.map(info => info.teamAHome), lowHomePattern, 'team A as the lower seed should open on the road and follow 2-2-1-1-1');
assert.ok(Math.abs(lowSeedA[0].seedBonus + 2.8) < 1e-9, 'team A as the lower seed should receive a negative seed bonus');

function playGame(game, playoff) {
  const info = ctx.getPlayoffSeriesGameContext('STRONG', 'WEAK', game);
  return ctx.simulate82StyleMatchup('STRONG', 'WEAK', {
    neutralState:true,
    includeBoxScore:false,
    teamAHome:info.teamAHome,
    seedBonus:info.seedBonus,
    isPlayoff:playoff
  }).won;
}

let regularWins = 0;
let playoffWins = 0;
const gameSamples = 12000;
for (let i = 0; i < gameSamples; i++) {
  if (playGame(i % 7, false)) regularWins++;
  if (playGame(i % 7, true)) playoffWins++;
}
const regularRate = regularWins / gameSamples;
const playoffRate = playoffWins / gameSamples;
assert.ok(playoffRate >= 0.72 && playoffRate <= 0.88, `strong-team playoff win rate ${(playoffRate * 100).toFixed(1)}% should be decisive but not forced`);
assert.ok(playoffRate >= regularRate + 0.025, 'shortened playoff rotation/noise should make a large power gap more reliable');

let strongSeriesWins = 0;
let sevenGameSeries = 0;
const seriesSamples = 3000;
for (let s = 0; s < seriesSamples; s++) {
  let winsA = 0;
  let winsB = 0;
  let games = 0;
  while (winsA < 4 && winsB < 4) {
    if (playGame(games, true)) winsA++;
    else winsB++;
    games++;
  }
  if (winsA === 4) strongSeriesWins++;
  if (games === 7) sevenGameSeries++;
}
const seriesRate = strongSeriesWins / seriesSamples;
const gameSevenRate = sevenGameSeries / seriesSamples;
assert.ok(seriesRate >= 0.88 && seriesRate < 1, `strong-team series rate ${(seriesRate * 100).toFixed(1)}% should preserve upsets`);
assert.ok(gameSevenRate >= 0.01 && gameSevenRate <= 0.20, `Game 7 rate ${(gameSevenRate * 100).toFixed(1)}% should not be abnormally high`);

console.log(`Playoff balance checks passed: game ${(playoffRate * 100).toFixed(1)}%, series ${(seriesRate * 100).toFixed(1)}%, Game 7 ${(gameSevenRate * 100).toFixed(1)}%.`);
