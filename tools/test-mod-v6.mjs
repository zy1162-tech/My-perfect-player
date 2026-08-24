import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const teams = ['ATL','BKN','BOS','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
const context = {
  console,
  Math,
  window:null,
  STATE:{ mode:'legend', eraStart:2010, career:{ seasonCount:0, flags:{} } },
  NBA2K_TEAMS:teams,
  NBA2K_DATA:Object.fromEntries(teams.map(team => [team, []])),
  getTeamName:team => team,
  clearLineupCache:() => {},
  processDraft:() => { context.originalDraftCalled = true; },
  document:{ getElementById:() => null, createElement:() => ({}) }
};
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../assets/data/era-mode-data.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../assets/data/era-complete-rosters.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../assets/js/perfect-player-era-mode.js', import.meta.url), 'utf8'), context);

for (const year of [2003, 2010, 2016]) {
  const eraPlayers = Object.values(context.__PP_COMPLETE_ERA_ROSTERS__[year]).flat();
  const identities = new Set(eraPlayers.map(player => player.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '')));
  assert.equal(eraPlayers.length, 450, year + ' should contain 30 x 15 roster slots');
  assert.equal(identities.size, 450, year + ' should not duplicate one player across teams');
}

context.applyLegendEraLeague();
assert.equal(context.STATE._legendLeagueApplied, 2010);
teams.forEach(team => assert.equal(context.NBA2K_DATA[team].length, 15, team + ' roster should contain 15 real players'));
assert.equal(context.NBA2K_DATA.CLE.find(player => player.name === 'LeBron James')?.ovr, 96, 'NBA 2K10 anchor rating');
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Stephen Curry')?.ovr, 69, 'NBA 2K10 rookie Curry rating');
assert.ok(context.NBA2K_DATA.OKC.some(player => player.name === 'James Harden'), '2010 mode should include Harden on OKC');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => player._eraRoster), 'legend league must not leak current roster players');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => !/EraRole|时代轮换/.test(player.name)), 'placeholder roster names are forbidden');

context.STATE.career.seasonCount = 1;
context.processDraft();
assert.ok(context.NBA2K_DATA.CLE.some(player => player.name === 'Kyrie Irving'), '2011 real draft class should enter after first 2010 season');
assert.equal(context.originalDraftCalled, undefined, 'historical class should replace fictional draft while data exists');

context.STATE.eraStart = 2016;
context.STATE.career.seasonCount = 0;
context.STATE._legendLeagueApplied = null;
context.applyLegendEraLeague();
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Stephen Curry')?.ovr, 93, 'NBA 2K16 Curry anchor rating');
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Klay Thompson')?.ovr, 87, 'NBA 2K16 Klay anchor rating');
teams.forEach(team => assert.equal(context.NBA2K_DATA[team].length, 15, team + ' 2016 roster should contain 15 real players'));

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const v4 = await readFile(new URL('../assets/js/perfect-player-mod-v4.js', import.meta.url), 'utf8');
const eraMode = await readFile(new URL('../assets/js/perfect-player-era-mode.js', import.meta.url), 'utf8');
assert.match(core, /showPlayoffMatchupPreview/);
assert.match(core, /renderBoxRows\(topHome/);
assert.match(core, /showPlayoffGameDataPanel\(gameEntry/);
assert.match(core, /continue-current-btn/);
assert.match(core, /lenf_legend_auto_slot/);
assert.match(core, /targetScreen === 'screen-season'/);
assert.match(core, /targetScreen === 'screen-playoffs'/);
assert.match(core, /tempoTurnoverDivider/);
assert.match(v4, /slice\(0, 15\)/);
assert.match(core, /pp-game-box-head/);
assert.match(core, /hierarchyRank/);
assert.ok(!/roster\.length\s*[<>]=?\s*18|newRoster\.length\s*<\s*18/.test(core), 'current-era roster logic should no longer target 18 players');
assert.ok(!/roster\.length\s*>=\s*18/.test(eraMode + v4), 'signing and era roster logic should cap teams at 15 players');
assert.ok(v4.indexOf('processTrades();') < v4.indexOf('showRecruitmentMarket(function()'), 'trades must finish before recruitment decision');

console.log('V7 checks passed: complete 2010/2016 rosters, anchor ratings, real names, per-game panel, dual saves.');
