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
vm.runInContext(await readFile(new URL('../assets/data/player-rating-calibration.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../assets/js/perfect-player-era-mode.js', import.meta.url), 'utf8'), context);

for (const year of [2003, 2010, 2016]) {
  const eraPlayers = Object.values(context.__PP_COMPLETE_ERA_ROSTERS__[year]).flat();
  const identities = new Set(eraPlayers.map(player => player.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '')));
  assert.equal(eraPlayers.length, 450, year + ' should contain 30 x 15 roster slots');
  assert.equal(identities.size, 450, year + ' should not duplicate one player across teams');
}

context.applyLegendEraLeague();
assert.equal(context.STATE._legendLeagueApplied, 2010);
teams.forEach(team => assert.ok(context.NBA2K_DATA[team].length >= 10 && context.NBA2K_DATA[team].length <= 15, team + ' should retain a playable roster within the 15-player cap after real offseason transfers'));
assert.ok(context.NBA2K_DATA.ATL.some(player => player.name === 'Jordan Crawford'), '2010 opening must retain Crawford on ATL; the WAS trade was in February 2011');
assert.ok(!context.NBA2K_DATA.WAS.some(player => player.name === 'Jordan Crawford'), '2011 midseason trades must not leak into the 2010 opening');
assert.equal(context.NBA2K_DATA.MIA.find(player => player.name === 'LeBron James')?._sourceOvr, 96, 'NBA 2K10 source rating after the 2010 move to MIA');
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Stephen Curry')?._sourceOvr, 69, 'Curry must retain his original source rating separately from the calibrated season rating');
assert.ok(context.NBA2K_DATA.GSW.find(player => player.name === 'Stephen Curry')?.ovr >= 70, 'opening must use the production playable rating scale');
assert.equal(context.NBA2K_DATA.MIA.find(player => player.name === 'LeBron James')?.pos, 'SF/PF/PG/SG', 'LeBron should retain all historical lineup positions');
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Stephen Curry')?.pos, 'PG/SG', 'Curry should retain both guard positions');
assert.equal(context.NBA2K_DATA.MIA.find(player => player.name === 'LeBron James')?._peakOvr, 99, 'young LeBron should have a historical peak growth target');
assert.ok(context.NBA2K_DATA.OKC.some(player => player.name === 'James Harden'), '2010 mode should include Harden on OKC');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => player._eraRoster), 'legend league must not leak current roster players');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => !/EraRole|时代轮换/.test(player.name)), 'placeholder roster names are forbidden');
assert.ok(Object.values(context.NBA2K_DATA).flat().filter(player => player.cname !== player.name).length >= 330, '2010 should localize most roster names');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => player._ratingCalibrationVersion === context.PP_RATING_CALIBRATION.version), 'opening players must use the same calibration module as the page');
const savedLeBron = context.NBA2K_DATA.MIA.find(player => player.name === 'LeBron James');
savedLeBron.pos = 'SG';
assert.ok(context.repairLegendEraPositions(2010) >= 1, 'old legend saves should repair stale position and age metadata');
assert.equal(savedLeBron.pos, 'SF/PF/PG/SG');
const savedCrawford = context.NBA2K_DATA.ATL.find(player => player.name === 'Jordan Crawford');
context.NBA2K_DATA.ATL.splice(context.NBA2K_DATA.ATL.indexOf(savedCrawford), 1);
context.NBA2K_DATA.WAS.push(savedCrawford);
context.applyLegendEraLeague();
assert.ok(context.NBA2K_DATA.WAS.includes(savedCrawford), 'loading an existing save must preserve Crawford\'s later trade');
assert.ok(!context.NBA2K_DATA.ATL.includes(savedCrawford), 'opening correction must not replay into an already-applied league');

context.STATE.career.seasonCount = 1;
context.processDraft();
assert.ok(context.NBA2K_DATA.CLE.some(player => player.name === 'Kyrie Irving'), '2011 real draft class should enter after first 2010 season');
assert.equal(context.originalDraftCalled, undefined, 'historical class should replace fictional draft while data exists');

context.STATE.eraStart = 2016;
context.STATE.career.seasonCount = 0;
context.STATE._legendLeagueApplied = null;
context.applyLegendEraLeague();
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Stephen Curry')?._sourceOvr, 93, 'NBA 2K16 Curry source rating');
assert.equal(context.NBA2K_DATA.GSW.find(player => player.name === 'Klay Thompson')?._sourceOvr, 87, 'NBA 2K16 Klay source rating');
teams.forEach(team => assert.ok(context.NBA2K_DATA[team].length >= 10 && context.NBA2K_DATA[team].length <= 15, team + ' 2016 opening roster must stay playable and respect the 15-player cap'));
assert.ok(Object.values(context.NBA2K_DATA).flat().filter(player => player.cname !== player.name).length >= 300, '2016 should localize most roster names');

context.STATE.career.seasonCount = 20;
context.processDraft();
assert.ok(Object.values(context.NBA2K_DATA).flat().some(player => player._eraGenerated), 'years without a real draft class should use era-safe fictional rookies');
assert.ok(Object.values(context.NBA2K_DATA).flat().every(player => player.photoSource !== 'generated-rookie-pool'), 'legend eras must not fall back to the current rookie pool');

context.STATE.eraStart = 2003;
context.STATE.career.seasonCount = 12;
context.STATE._legendLeagueApplied = null;
context.applyLegendEraLeague();
const eraLeBron = context.NBA2K_DATA.CLE.find(player => player.name === 'LeBron James');
assert.equal(eraLeBron._age, 19, '2003 LeBron uses the same target-season age as the production page');
assert.ok(context.NBA2K_DATA.PHX.some(player => player.name === 'Leandro Barbosa'), 'same-team draft correction must retain 2003 Barbosa on PHX');
assert.equal(context.NBA2K_DATA.SAC.find(player => player.name === 'Chris Webber')?._sourceOvr, 91, '2003 official 2K3 Webber source remains 91');
assert.equal(context.NBA2K_DATA.LAL.find(player => player.name === 'Gary Payton')?.ovr, 87, '2003 Lakers Payton should use his age-35 season rating, not his peak card');
assert.equal(context.NBA2K_DATA.LAL.find(player => player.name === 'Karl Malone')?.ovr, 84, '2003 Lakers Malone should use his age-40 season rating, not his peak card');
assert.equal(context.NBA2K_DATA.LAL.length, 15, 'adding the Lakers F4 must preserve the 15-player roster cap');
context.NBA2K_DATA.CLE.splice(context.NBA2K_DATA.CLE.indexOf(eraLeBron), 1);
context.NBA2K_DATA.MIA.push(eraLeBron);
eraLeBron._age = 30;
eraLeBron.ovr = 87;
context.repairLegendEraPositions(2003);
assert.equal(eraLeBron.ovr, 87, 'metadata repair must preserve a saved OVR even after a trade');
assert.equal(eraLeBron._primeEndAge, 41, 'LeBron prime window should cover the 2025-26 historical season');

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
assert.match(core, /repairLegendEraPositions\(STATE\.eraStart\)/);
assert.match(core, /getEraPlayerGrowthBonus/);
assert.match(core, /PP_ERA_MODE\.generateRookie/);
assert.match(v4, /管理层会谈/);
assert.match(v4, /showRosterAuthority\(function\(\)/);
assert.ok(!/roster\.length\s*[<>]=?\s*18|newRoster\.length\s*<\s*18/.test(core), 'current-era roster logic should no longer target 18 players');
assert.ok(!/roster\.length\s*>=\s*18/.test(eraMode + v4), 'signing and era roster logic should cap teams at 15 players');
const pipeline=v4.slice(v4.indexOf('global.continueCareerAfterTraining ='));
assert.ok(pipeline.indexOf('processTrades();') < pipeline.indexOf("STATE._offseasonMarketStage = 'intel'"), 'trades must finish before management and recruitment decisions');

console.log('Era integration checks passed: offseason rosters, preserved source ratings, same-team rookies, immutable saved OVR, per-game panel and dual saves.');
