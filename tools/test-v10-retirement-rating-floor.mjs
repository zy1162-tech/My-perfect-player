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
  const sizes = Object.values(context.NBA2K_DATA).map(roster => roster.length);
  assert.ok(players.length >= 360 && players.length <= 450, `${year} should retain an NBA-sized 12-15 player roster pool`);
  assert.ok(sizes.every(size => size >= 12 && size <= 15), `${year} each team should stay within the 12-15 player roster range`);
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
assert.equal(amare._age, 30, '2012 Amar\'e age should be repaired to 30');
assert.equal(boozer._age, 31, '2012 Boozer age should be repaired to 31');
assert.ok(amare.ovr >= 70 && boozer.ovr >= 70, 'old-save ratings should be raised to the playable floor');

context.NBA2K_DATA.PHX.splice(context.NBA2K_DATA.PHX.indexOf(amare), 1);
context.repairLegendEraPositions(2003);
amare = context.NBA2K_DATA.PHX.find(player => player.name === "Amar'e Stoudemire");
assert.ok(amare && amare._prematureRetirementRestored, 'prematurely retired Amar\'e should be restored before age 34');
assert.equal(amare._age, 30);

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const averageFn = core.match(/function averageCareerAttributes\([\s\S]*?\n\}/)?.[0];
const longevityFn = core.match(/function getLeaguePlayerLongevityScore\([\s\S]*?\n\}/)?.[0];
const profileSeedFn = core.match(/function careerProfileSeed\([\s\S]*?\n\}/)?.[0];
const profileFn = core.match(/function ensureLeagueCareerProfile\([\s\S]*?\n\}/)?.[0];
const retirementFn = core.match(/function getLeagueRetirementChance\([\s\S]*?\n\}/)?.[0];
assert.ok(averageFn && longevityFn && profileSeedFn && profileFn && retirementFn, 'retirement functions should be independently testable');
const retirementContext = {};
vm.createContext(retirementContext);
vm.runInContext(`var window=this;var LEBRON_JAMES_SPECIAL_RULE={maxRetirementAge:42};${averageFn};${longevityFn};${profileSeedFn};${profileFn};${retirementFn};this.chance=getLeagueRetirementChance;this.profile=ensureLeagueCareerProfile;`, retirementContext);
assert.equal(retirementContext.chance({ ovr:70 }, 29), 0, 'age-29 players cannot randomly retire');
assert.equal(retirementContext.chance({ ovr:84 }, 33), 0, 'age-33 rotation players remain protected');
assert.equal(retirementContext.chance({ ovr:90 }, 42), 100, 'age 42 remains the hard retirement boundary');
const profilePlayer = { name:'Stable Rotation Player', ovr:84, _age:26 };
retirementContext.profile(profilePlayer);
assert.ok(profilePlayer._declineStartAge >= 28 && profilePlayer._declineStartAge <= 34, 'every player should receive a bounded decline-start age');
assert.ok(profilePlayer._retirementAge > profilePlayer._declineStartAge && profilePlayer._retirementAge <= 42, 'every player should receive a deterministic retirement age');
assert.equal(retirementContext.chance(profilePlayer, profilePlayer._retirementAge - 1), 0, 'players should not retire before their own planned endpoint');
assert.equal(retirementContext.chance(profilePlayer, profilePlayer._retirementAge), 100, 'players should retire at their own planned endpoint');

console.log('V10 checks passed: all era rosters use OVR 70+, old ages are repaired, and every player receives a deterministic decline/retirement profile.');
