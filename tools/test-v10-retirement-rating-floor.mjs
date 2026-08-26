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
for (const file of ['../assets/data/era-mode-data.js','../assets/data/era-complete-rosters.js','../assets/js/perfect-player-era-mode.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context);
}

for (const year of [2003, 2010, 2016]) {
  context.STATE.eraStart = year;
  context.STATE.career.seasonCount = 0;
  context.STATE._legendLeagueApplied = null;
  context.applyLegendEraLeague();
  const players = Object.values(context.NBA2K_DATA).flat();
  assert.equal(players.length, 450, `${year} should keep 30 x 15 players`);
  assert.ok(players.every(player => player.ovr >= 70), `${year} playable roster must not contain 60s ratings`);
  assert.ok(players.some(player => player._sourceOvr < 70 && player.ovr === 70), `${year} should preserve low source ratings behind the playable floor`);
}

context.STATE.eraStart = 2003;
context.STATE.career.seasonCount = 9;
context.STATE._legendLeagueApplied = null;
context.applyLegendEraLeague();
let amare = context.NBA2K_DATA.PHX.find(player => player.name === "Amar'e Stoudemire");
let boozer = context.NBA2K_DATA.CLE.find(player => player.name === 'Carlos Boozer');
amare._age = 39;
boozer._age = 38;
amare.ovr = 66;
boozer.ovr = 64;
context.repairLegendEraPositions(2003);
assert.equal(amare._age, 29, '2012 Amar\'e age should be repaired to 29');
assert.equal(boozer._age, 30, '2012 Boozer age should be repaired to 30');
assert.ok(amare.ovr >= 70 && boozer.ovr >= 70, 'old-save ratings should be raised to the playable floor');

context.NBA2K_DATA.PHX.splice(context.NBA2K_DATA.PHX.indexOf(amare), 1);
context.repairLegendEraPositions(2003);
amare = context.NBA2K_DATA.PHX.find(player => player.name === "Amar'e Stoudemire");
assert.ok(amare && amare._prematureRetirementRestored, 'prematurely retired Amar\'e should be restored before age 34');
assert.equal(amare._age, 29);

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const averageFn = core.match(/function averageCareerAttributes\([\s\S]*?\n\}/)?.[0];
const longevityFn = core.match(/function getLeaguePlayerLongevityScore\([\s\S]*?\n\}/)?.[0];
const retirementFn = core.match(/function getLeagueRetirementChance\([\s\S]*?\n\}/)?.[0];
assert.ok(averageFn && longevityFn && retirementFn, 'retirement functions should be independently testable');
const retirementContext = {};
vm.createContext(retirementContext);
vm.runInContext(`var LEBRON_JAMES_SPECIAL_RULE={maxRetirementAge:42};${averageFn};${longevityFn};${retirementFn};this.chance=getLeagueRetirementChance;`, retirementContext);
assert.equal(retirementContext.chance({ ovr:70 }, 29), 0, 'age-29 players cannot randomly retire');
assert.equal(retirementContext.chance({ ovr:84 }, 33), 0, 'age-33 rotation players remain protected');
assert.ok(retirementContext.chance({ ovr:70 }, 34) < 8, 'age-34 retirement should begin gently');
assert.equal(retirementContext.chance({ ovr:90 }, 42), 100, 'age 42 remains the hard retirement boundary');

let seed = 20260825;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const retirementAges = [];
for (let career = 0; career < 10000; career++) {
  let retiredAt = 42;
  for (let age = 18; age <= 42; age++) {
    if (random() * 100 < retirementContext.chance({ ovr:84 }, age)) {
      retiredAt = age;
      break;
    }
  }
  retirementAges.push(retiredAt);
}
assert.equal(Math.min(...retirementAges), 36, '84 OVR players should receive protection through age 35');
const averageRetirementAge = retirementAges.reduce((sum, age) => sum + age, 0) / retirementAges.length;
assert.ok(averageRetirementAge >= 39 && averageRetirementAge <= 41.5, `long-run retirement age should remain realistic, got ${averageRetirementAge}`);

console.log(`V10 checks passed: all era rosters use OVR 70+, old ages are repaired, and protected-player average retirement age is ${averageRetirementAge.toFixed(1)}.`);
