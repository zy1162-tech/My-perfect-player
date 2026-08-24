import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ages = JSON.parse(await readFile('assets/data/player-ages.json', 'utf8'));
const localAgeContext = { window: {} };
vm.createContext(localAgeContext);
vm.runInContext(await readFile('assets/data/player-ages-local.js', 'utf8'), localAgeContext);
assert.deepEqual(JSON.parse(JSON.stringify(localAgeContext.window.__PLAYER_AGE_ROWS__)), ages);
assert.equal(ages.find((row) => row.n === 'Stephen Curry')?.a, 37);

const html = await readFile('nba-perfect-player.html', 'utf8');
assert.ok(html.indexOf('player-ages-local.js') < html.indexOf('perfect-player-core.js'));
assert.doesNotMatch(html, /fetch\(AGE_URL/);
const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1].split('?')[0]);
const duplicates = scriptSources.filter((src, index) => scriptSources.indexOf(src) !== index);
assert.deepEqual(duplicates, [], `duplicate script loads: ${duplicates.join(', ')}`);

const skillState = {
  attrs: {},
  career: { profile: {}, flags: {}, skills: { points: 0, earned: 0, purchased: {} } },
  season: { playerStats: { games: 0 }, awards: [] }
};
const skillContext = { STATE: skillState };
skillContext.window = skillContext;
vm.createContext(skillContext);
vm.runInContext(await readFile('assets/js/perfect-player-skills.js', 'utf8'), skillContext);
const minimum = skillContext.PP_SKILLS.computeSeasonStyleGrant();
assert.equal(minimum.total, 15);
assert.equal(skillContext.PP_SKILLS.grantSeasonStylePoints().total, 30);
assert.equal(skillState.career.skills.points, 30);
assert.equal(skillContext.PP_SKILLS.grantSeasonStylePoints().total, 30, 'same season returns the original grant');
assert.equal(skillState.career.skills.points, 30, 'same season cannot grant twice');

skillState.season = {
  playerStats: { games: 82, pts: 82 * 30, reb: 82 * 12, ast: 82 * 8, stl: 82 * 2, blk: 82 * 2 },
  awards: ['全明星', 'MVP'],
  playoffBracket: { results: [
    { isMySeries: true, round: 0, teamA: 'GSW', aWon: true },
    { isMySeries: true, round: 1, teamA: 'GSW', aWon: true },
    { isMySeries: true, round: 2, teamA: 'GSW', aWon: true },
    { isMySeries: true, round: 3, teamA: 'GSW', aWon: true }
  ] },
  isChampion: true
};
skillState.careerTeam = 'GSW';
assert.equal(skillContext.PP_SKILLS.computeSeasonStyleGrant().total, 25);
assert.equal(skillContext.PP_SKILLS.grantSeasonStylePoints().total, 50);

const core = await readFile('assets/js/perfect-player-core.js', 'utf8');
assert.match(core, /function repairLeagueAgesFromBundledData\(\)/);
assert.match(core, /mergeBundledPlayerAgeRows\(\);\s*repairLeagueAgesFromBundledData\(\);/);
const ageHelpers = core.slice(
  core.indexOf('function mergeBundledPlayerAgeRows()'),
  core.indexOf('function getPlayerAge(playerName)')
);
const repairContext = {
  window: { __PLAYER_AGE_ROWS__: ages },
  STATE: { career: { seasonCount: 8, flags: {} } },
  NBA2K_TEAMS: ['GSW'],
  NBA2K_DATA: { GSW: [
    { name: 'Stephen Curry', _age: 36 },
    { name: 'Generated Rookie', _age: 20 }
  ] },
  rngNext: () => 0.5,
  _playerAges: {},
  _playerGenes: {}
};
vm.createContext(repairContext);
vm.runInContext(ageHelpers, repairContext);
assert.equal(repairContext.repairLeagueAgesFromBundledData(), 1);
assert.equal(repairContext.NBA2K_DATA.GSW[0]._age, 44);
assert.equal(repairContext.NBA2K_DATA.GSW[1]._age, 20);
assert.equal(repairContext.repairLeagueAgesFromBundledData(), 0, 'age repair must only run once per save');

const boot = await readFile('assets/js/perfect-player-boot.js', 'utf8');
assert.match(boot, /perfect-player-skills\.js\?v=20260824-(?:season-points-v5|turnovers-v6)/);

console.log('V5 checks passed: local ages, Curry age 37, save repair, 30-50 season points, no duplicate scripts.');
