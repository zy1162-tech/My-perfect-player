import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const teams = ['ATL','BKN','BOS','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
const context = {
  console,
  Math,
  window:null,
  STATE:{ mode:'legend', eraStart:2003, career:{ seasonCount:0, flags:{} } },
  NBA2K_TEAMS:teams,
  NBA2K_DATA:Object.fromEntries(teams.map(team => [team, []])),
  clearLineupCache:() => {},
  processDraft:() => {},
  document:{ getElementById:() => null, createElement:() => ({}) }
};
context.window = context;
vm.createContext(context);
for (const file of ['../assets/data/era-mode-data.js','../assets/data/era-complete-rosters.js','../assets/data/player-rating-calibration.js','../assets/js/perfect-player-era-mode.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context);
}

for (const year of [2003, 2010, 2016]) {
  context.STATE.eraStart = year;
  context.STATE.career.seasonCount = 0;
  context.STATE._legendLeagueApplied = null;
  context.applyLegendEraLeague();
  const players = Object.values(context.NBA2K_DATA).flat();
  assert.ok(players.length >= 420 && players.length <= 450, `${year} shifted opening roster size`);
  assert.ok(new Set(players.map(player => player.ovr)).size >= 24, `${year} must retain a continuous rating distribution`);
  assert.ok(players.some(player => player.ovr < 70), `${year} fringe ratings must not be flattened to 70`);
  assert.ok(players.every(player => Number.isFinite(player._sourceOvr)), `${year} source ratings remain auditable`);
}

context.STATE.eraStart = 2003;
context.STATE.career.seasonCount = 9;
context.STATE._legendLeagueApplied = null;
context.applyLegendEraLeague();
let amare = context.NBA2K_DATA.PHX.find(player => player.name === "Amar'e Stoudemire");
let boozer = context.NBA2K_DATA.CLE.find(player => player.name === 'Carlos Boozer');
amare._age = 39;
boozer._age = 38;
amare.ovr = 77;
boozer.ovr = 64;
const amareFin = amare.FIN;
context.repairLegendEraPositions(2003);
assert.equal(amare._age, 30, 'opening age 21 plus nine completed seasons should repair Amar\'e to 30');
assert.equal(boozer._age, 31, 'opening age 22 plus nine completed seasons should repair Boozer to 31');
assert.equal(amare.ovr, 77, 'old-save Amar\'e must not be raised to primeFloor');
assert.equal(amare.FIN, amareFin, 'old-save attributes must not be ratio-scaled');
assert.equal(boozer.ovr, 64, 'old-save fringe/decline OVR is a saved fact');

context.NBA2K_DATA.PHX.splice(context.NBA2K_DATA.PHX.indexOf(amare), 1);
context.repairLegendEraPositions(2003);
amare = context.NBA2K_DATA.PHX.find(player => player.name === "Amar'e Stoudemire");
assert.ok(amare && amare._prematureRetirementRestored, 'prematurely retired Amar\'e should be restored before age 34');
assert.equal(amare._age, 30);

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const averageFn = core.match(/function averageCareerAttributes\([\s\S]*?\n\}/)?.[0];
const seedFn = core.match(/function careerProfileSeed\([\s\S]*?\n\}/)?.[0];
const profileFn = core.match(/function ensureLeagueCareerProfile\([\s\S]*?\n\}/)?.[0];
const longevityFn = core.match(/function getLeaguePlayerLongevityScore\([\s\S]*?\n\}/)?.[0];
const retirementFn = core.match(/function getLeagueRetirementChance\([\s\S]*?\n\}/)?.[0];
assert.ok(averageFn && seedFn && profileFn && longevityFn && retirementFn, 'retirement functions should be independently testable');
const retirementContext = {};
vm.createContext(retirementContext);
vm.runInContext(`var LEBRON_JAMES_SPECIAL_RULE={maxRetirementAge:42};${averageFn};${seedFn};${profileFn};${longevityFn};${retirementFn};this.chance=getLeagueRetirementChance;`, retirementContext);
assert.equal(retirementContext.chance({ ovr:70 }, 29), 0, 'age-29 players cannot randomly retire');
assert.equal(retirementContext.chance({ ovr:84 }, 33), 0, 'age-33 rotation players remain protected');
assert.ok(retirementContext.chance({ ovr:70 }, 34) < 8, 'age-34 retirement should begin gently');
assert.equal(retirementContext.chance({ ovr:90 }, 42), 100, 'age 42 remains the hard retirement boundary');

const retirementAges = [];
for (let career = 0; career < 1000; career++) {
  const player = { nameEN:`Career ${career}`, ovr:84, _age:22 };
  let retiredAt = 42;
  for (let age = 18; age <= 42; age++) {
    if (retirementContext.chance(player, age) >= 100) {
      retiredAt = age;
      break;
    }
  }
  retirementAges.push(retiredAt);
}
assert.ok(Math.min(...retirementAges) >= 36, '84 OVR careers should receive protection through age 35');
assert.ok(Math.max(...retirementAges) <= 42, 'career profiles retain a hard retirement boundary');
const averageRetirementAge = retirementAges.reduce((sum, age) => sum + age, 0) / retirementAges.length;
assert.ok(averageRetirementAge >= 39 && averageRetirementAge <= 41.5, `identity-stable retirement age should remain realistic, got ${averageRetirementAge}`);

console.log(`V10 checks passed: continuous era ratings, immutable old-save OVR, repaired ages, and protected-player average retirement age ${averageRetirementAge.toFixed(1)}.`);
