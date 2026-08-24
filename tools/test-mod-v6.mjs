import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const teams = ['ATL','BKN','BOS','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
const context = {
  console,
  Math,
  window:null,
  STATE:{ mode:'legend', eraStart:2009, career:{ seasonCount:0, flags:{} } },
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
vm.runInContext(await readFile(new URL('../assets/js/perfect-player-era-mode.js', import.meta.url), 'utf8'), context);

context.applyLegendEraLeague();
assert.equal(context.STATE._legendLeagueApplied, 2009);
teams.forEach(team => assert.ok(context.NBA2K_DATA[team].length >= 18, team + ' roster should have a full 18-player rotation'));
assert.ok(context.NBA2K_DATA.GSW.some(player => player.name === 'Stephen Curry'), '2009 mode should include Curry on GSW');
assert.ok(context.NBA2K_DATA.OKC.some(player => player.name === 'James Harden'), '2009 mode should include Harden on OKC');
assert.ok(context.NBA2K_DATA.LAC.some(player => player.name === 'Blake Griffin'), '2009 mode should include Griffin on LAC');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => player._eraRoster), 'legend league must not leak current roster players');

context.STATE.career.seasonCount = 1;
context.processDraft();
assert.ok(context.NBA2K_DATA.WAS.some(player => player.name === 'John Wall'), '2010 real draft class should enter after first 2009 season');
assert.equal(context.originalDraftCalled, undefined, 'historical class should replace fictional draft while data exists');

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const v4 = await readFile(new URL('../assets/js/perfect-player-mod-v4.js', import.meta.url), 'utf8');
assert.match(core, /showPlayoffMatchupPreview/);
assert.match(core, /renderBoxRows\(topHome/);
assert.match(core, /tempoTurnoverDivider/);
assert.ok(v4.indexOf('processTrades();') < v4.indexOf('showRecruitmentMarket(function()'), 'trades must finish before recruitment decision');

console.log('V6 checks passed: era rosters, historical drafts, roster preview, box score, turnover balance, recruitment order.');
