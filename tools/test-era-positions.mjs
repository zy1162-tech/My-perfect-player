import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const dataContext = {};
dataContext.window = dataContext;
vm.createContext(dataContext);
vm.runInContext(await readFile(new URL('../assets/data/era-complete-rosters.js', import.meta.url), 'utf8'), dataContext);
const eras = dataContext.__PP_COMPLETE_ERA_ROSTERS__;
const validPositions = new Set(['PG','SG','SF','PF','C']);

function findPlayer(year, name) {
  return Object.values(eras[year]).flat().find(player => player.nameEn === name);
}
function expectPositions(year, name, expected) {
  const player = findPlayer(year, name);
  assert.ok(player, `${year} should include ${name}`);
  const positions = player.pos.split('/');
  expected.forEach(position => assert.ok(positions.includes(position), `${year} ${name} should play ${position}: ${player.pos}`));
}

for (const year of [2003, 2010, 2016]) {
  const players = Object.values(eras[year]).flat();
  assert.ok(players.filter(player => player.pos.includes('/')).length >= 20, `${year} should retain meaningful multi-position data`);
  players.forEach(player => player.pos.split('/').forEach(position => assert.ok(validPositions.has(position), `${player.nameEn} has invalid position ${position}`)));
}

for (const year of [2003, 2010, 2016]) expectPositions(year, 'LeBron James', ['SF','PF','PG']);
for (const year of [2010, 2016]) expectPositions(year, 'Stephen Curry', ['PG','SG']);
expectPositions(2016, 'Draymond Green', ['PF','SF','C']);
expectPositions(2016, 'Giannis Antetokounmpo', ['SF','PF','PG']);
expectPositions(2010, 'Kevin Durant', ['SF','PF']);
expectPositions(2003, 'Tim Duncan', ['PF','C']);

// 真实排阵回归：2003 骑士加入一个高评分分卫后，詹姆斯应改打其他位置并继续首发。
const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const lineupStart = core.indexOf('function getPlayerPositions(');
const lineupEnd = core.indexOf('function clearLineupCache(', lineupStart);
assert.ok(lineupStart >= 0 && lineupEnd > lineupStart, 'lineup functions should be extractable');
const lineupContext = {
  NBA2K_DATA:{ CLE:eras[2003].CLE.map(player => ({ ...player, name:player.nameEn, cname:player.nameEn })) },
  STATE:{ careerTeam:'CLE', position:'SG', finalOVR:92, attrs:{}, career:{}, season:{}, _lineupCache:{} },
  getCareerProfileEffects:() => ({ lineupBonus:0 }),
  getHupuDisplayName:() => '测试分卫'
};
vm.createContext(lineupContext);
vm.runInContext(core.slice(lineupStart, lineupEnd), lineupContext);
const lineup = lineupContext.calcTeamLineup('CLE');
const starterEntries = Object.entries(lineup.starters);
assert.ok(starterEntries.some(([, player]) => player && player._isUser), 'created shooting guard should start');
const lebronSlot = starterEntries.find(([, player]) => player && player.name === 'LeBron James');
assert.ok(lebronSlot, 'LeBron should remain a starter beside a created shooting guard');
assert.notEqual(lebronSlot[0], 'SG', 'LeBron should move to another historical position when SG is occupied');

console.log(`Era position checks passed: 2003/2010/2016 multi-position data; LeBron starts at ${lebronSlot[0]} beside a created SG.`);
