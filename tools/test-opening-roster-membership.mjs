import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

const reference = JSON.parse(fs.readFileSync(new URL('artifacts/current-roster-reference-20261003.json', import.meta.url), 'utf8'));
const historical = JSON.parse(fs.readFileSync(new URL('artifacts/historical-opening-roster-reference.json', import.meta.url),'utf8'));
for (const [era,team,players] of JSON.parse(fs.readFileSync(new URL('artifacts/historical-opening-browser-reference.json',import.meta.url),'utf8'))) historical.push({era,team,players:players.map(([name])=>({name}))});
const identity = name => {
  const key = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return ({'metta world peace':'ron artest','enes freedom':'enes kanter','nene hilario':'nene','raulzinho neto':'raul neto','michael patrick gbinije':'michael gbinije','sheldon mac':'sheldon mcclellan','menke batere':'mengke bateer','zhizhi wang':'wang zhizhi','jianlian yi':'yi jianlian','matt dellavedova':'matthew dellavedova'})[key] || key;
};
const nameOf = p => identity(p.nameEN || p.nameEn || p.name);
const modern = createSimulation('current', 101);
for (const t of reference.teams) {
  assert.deepEqual(Array.from(modern.rosters[t.team], p => Number(p.nbaId)).sort((a,b)=>a-b), t.players.map(p => Number(p.nbaId)).sort((a,b)=>a-b), `${t.team}: all official players must be represented exactly once`);
  assert.equal(modern.context.getBuildPlayerPool(t.team), modern.rosters[t.team], 'building and competition must use the same roster');
}
assert.equal(modern.rosters.BOS.some(p => /jaylen brown/i.test(p.nameEN)), false);
assert.equal(modern.rosters.PHI.filter(p => /jaylen brown/i.test(p.nameEN)).length, 1);
modern.context.applyDraftClass2026();
assert.equal(Object.values(modern.rosters).filter(Array.isArray).flat().length, 620, 'opening initialization must not reinsert outdated draft assignments');

for (const era of [2003, 2010, 2016]) {
  const f = createSimulation(era, 102), c = f.context;
  const teams = Object.fromEntries(historical.filter(t=>t.era===era).map(t=>[t.team,t.players.map(p=>[p.name])]));
  assert.deepEqual(Array.from(f.teams).sort(), Object.keys(teams).sort());
  const seen = new Set();
  for (const [team, rows] of Object.entries(teams)) {
    assert.deepEqual(Array.from(f.rosters[team], nameOf).sort(), Array.from(rows, row=>identity(row[0])).sort(), `${era} ${team}: opening-day membership`);
    for (const player of f.rosters[team]) {
      assert.ok(!seen.has(nameOf(player)), `${era}: duplicate player ${player.name}`);
      seen.add(nameOf(player));
    }
  }
  const schedule = c.getActiveLeagueSchedule();
  for (const [team, games] of Object.entries(schedule)) {
    assert.equal(games.length, 82);
    assert.equal(new Set(games.map(g=>g.day)).size, 82, `${team}: no double booking`);
    for (const g of games) {
      assert.ok(f.teams.includes(g.opponent) && g.opponent !== team);
      assert.equal(schedule[g.opponent].filter(other=>other.gameNum===g.gameNum && other.day===g.day && other.opponent===team && other.home!==g.home).length, 1, 'the opponent must share the same match');
    }
  }
  if (era === 2003) {
    assert.equal(f.teams.length, 29);
    assert.equal(c.getConference('NOP'), 'EAST');
    assert.ok(!seen.has(identity('Emeka Okafor')), '2004 rookies must not appear in 2003');
    f.state.career = c.createFreshCareer(); f.state.career.seasonCount = 1;
    c.processDraft();
    assert.equal(f.teams.length, 30, 'Charlotte must join in 2004');
    assert.equal(c.getConference('NOP'), 'WEST');
    assert.equal(f.rosters.CHA.filter(p=>nameOf(p)===identity('Emeka Okafor')).length, 1);
    const all = f.teams.flatMap(t=>f.rosters[t].map(nameOf));
    assert.equal(new Set(all).size, all.length, 'expansion and draft must not duplicate players');
    assert.ok(f.teams.every(t=>f.rosters[t].length>=8), 'every expansion-season team remains playable');
    const before = new Set(f.teams.flatMap(t=>f.rosters[t].map(nameOf)));
    f.state.career.seasonCount = 15; c.processDraft();
    assert.ok(f.teams.some(t=>f.rosters[t].some(p=>!before.has(nameOf(p)))), 'future synthetic drafts must use the active teams');
  }
}

// A completed 29-team regular season must account for every actual league match.
{
  const f = createSimulation(2003, 103), c = f.context, s = f.state;
  s.careerTeam='LAL'; s.season={standings:{}};
  c.initStandings(); c.buildRealSchedule();
  for (const game of s.season.schedule) {
    const result=c.simulate82StyleMatchup('LAL',game.opponent,{teamAHome:game.home,neutralState:true,includeBoxScore:false});
    s.season.standings.LAL[result.won?'wins':'losses']++;
    s.season.standings[game.opponent][result.won?'losses':'wins']++;
    c.simDayLeagueGames(game.day);
  }
  c.processAllRemainingDays();
  assert.ok(Object.values(s.season.standings).every(t=>t.wins+t.losses===82));
  assert.equal(Object.values(s.season.standings).reduce((n,t)=>n+t.wins,0),29*82/2);
}

// Switching away from a historical opening restores the modern base instead of a 29-team shell.
{
  const f = createSimulation('current', 104), c = f.context;
  c.captureBaseLeagueRoster();
  f.state.mode='legend'; f.state.eraStart=2003; c.applyLegendEraLeague();
  assert.equal(f.teams.length,29);
  c.restoreBaseLeagueRoster();
  assert.equal(f.teams.length,30);
  assert.equal(f.rosters.PHI.filter(p=>/jaylen brown/i.test(p.nameEN)).length,1);
}
console.log('Opening membership passed: 620 modern players, all 89 historical teams, shared build source, 29-team schedules, 2004 expansion, future drafts and mode restoration.');
