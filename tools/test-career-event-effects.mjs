import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const moduleSource = read('assets/js/perfect-player-career-events.js');
const runtimeSource = read('assets/js/perfect-player-event-runtime.js');
const liveSource = read('assets/js/perfect-player-live-sim.js');

function fixture(ovr = 80) {
  const f = createSimulation('current', 73);
  const { context:c, state:s } = f;
  c.getHupuDisplayName = () => 'Event Test Player';
  c.HUPU_USER = { nickname:'Event Test Player', avatar:'' };
  c.autoSaveGame = () => {};
  s.careerTeam = 'LAL'; s.position = 'SG'; s.finalOVR = ovr;
  s.attrs = Object.fromEntries(['FIN','MID','threePT','HAN','PAS','PDEF','IDEF','REB','BLK','STL','ATH','STR','CLU','STA'].map(key => [key, key === 'STA' ? 0 : ovr]));
  s.career = c.createFreshCareer();
  s.season = { games:[], schedule:Array.from({ length:82 }, (_, i) => ({ opponent:'BOS', day:i, home:i % 2 === 0 })),
    events:{ injuryGamesLeft:0, injuryRiskBonus:0 }, playerStats:{ games:0 }, playoffStats:{ games:0 } };
  vm.runInContext(moduleSource, c, { filename:'perfect-player-career-events.js' });
  vm.runInContext(runtimeSource, c, { filename:'perfect-player-event-runtime.js' });
  return { ...f, api:c.PP_CAREER_EVENTS };
}

function choose(f, id, index = 0) {
  const e = f.api.getState();
  e.pending = { id, key:'test:' + id, opponent:'BOS' };
  assert.equal(f.api.choose(index), true, id + ' must execute its production choice');
  return e;
}

// Both options of every definition run, without replacing the choice or settlement code.
let choicesChecked = 0;
for (const def of fixture().api.definitions) {
  for (let index = 0; index < def.choices.length; index++) {
    const f = fixture();
    const e = f.api.getState();
    e.money.cash = 1000000;
    const before = e.money.cash;
    choose(f, def.id, index);
    assert.equal(e.money.cash - before, def.choices[index].effect.cash || 0);
    assert.equal(f.api.choose(index), false, 'a second click must not apply the same choice twice');
    for (let game = 0; game < (def.choices[index].effect.games || 0); game++) {
      f.api.settleGame(def.id + ':' + game, { mins:20, pts:10 }, { won:true }, {});
    }
    assert.equal(e.effects.length, 0, 'every temporary choice must expire');
    choicesChecked++;
  }
}

{
  const f = fixture(), c = f.context, e = f.api.getState();
  const base = c.getPlayerRotationPlan(f.state.attrs, 'SG', false);
  choose(f, 'rotation_tryout');
  assert.equal(c.getPlayerRotationPlan(f.state.attrs, 'SG', false), Math.min(42, base + 6));
  assert.equal(f.api.getModifiers().load, 2);
  assert.ok(c.getSeasonInjuryEventRate() > 0, 'load must reach the real injury probability');
  for (let game = 0; game < 3; game++) {
    const key = 'rotation:' + game;
    f.api.settleGame(key, { mins:Math.ceil(base + 6), pts:17 }, { won:game !== 1 }, {});
    const remaining = f.api.getModifiers().minutes;
    assert.equal(f.api.settleGame(key, { mins:1 }, { won:false }, {}), false);
    assert.equal(f.api.getModifiers().minutes, remaining, 'duplicate settlement must not consume another game');
  }
  assert.equal(c.getPlayerRotationPlan(f.state.attrs, 'SG', false), base);
  assert.equal(c.getSeasonInjuryEventRate(), 0);
  assert.match(e.feedback.text, /合计 .* 分钟、51 分/);
  assert.equal(e.task, null);
}

{
  const f = fixture(95), c = f.context;
  choose(f, 'recovery_plan');
  for (let i = 0; i < 80; i++) {
    assert.ok(c.getPlayerRotationMinutes(f.state.attrs, 'SG', i % 2 === 0) <= 22, 'the hard cap must survive random minutes and playoffs');
    const pack = c.skipUserGamePack('BOS', false, 0, 1, f.state.attrs);
    assert.ok(pack.stats.mins <= 22, 'the complete direct-simulation player stat path must obey the cap');
  }
  vm.runInContext(liveSource, c, { filename:'perfect-player-live-sim.js' });
  for (let i = 0; i < 6; i++) {
    const watched = c.PP_LIVE.run('LAL', 'BOS', { attrs:f.state.attrs, teamAHome:i % 2 === 0, isPlayoff:i % 2 === 0 });
    assert.ok(watched.stats.mins <= 22, 'the complete watched-game engine must obey the medical limit');
  }
  // Exercise the real live-rotation function at a close fourth-quarter score.
  const fn = liveSource.match(/function userWantedOn\([\s\S]*?\n  \}/)[0];
  const user = { name:'Event Test Player', _isUser:true, ovr:95 };
  const rotation = { window:c, PP_CAREER_EVENTS:f.api, pid:p => p.name, ovrOf:p => p.ovr,
    remainingMins:() => 1, game:{ bp:{ rosterA:[user], userMins:22, userStarter:true }, lines:{ [user.name]:{ mins:22 } } } };
  vm.createContext(rotation);
  vm.runInContext(fn + '; answer = userWantedOn(game, "starters", 4, 30, 2, false);', rotation);
  assert.equal(rotation.answer, false, 'a close score must not override a medical limit in watched games');
}

{
  const f = fixture(), e = f.api.getState();
  const annual = e.money.annualSalary;
  for (let i = 0; i < 82; i++) f.api.settleGame('salary:' + i, i % 3 ? { mins:20 } : null, { won:false }, {});
  assert.equal(e.money.salary, annual, '82 team games including DNPs must pay exactly the annual contract');
  const cash = e.money.cash;
  assert.equal(f.api.settleGame('salary:81', null, {}, {}), false);
  f.api.settleGame('playoff:1', { mins:31 }, { won:true }, { isPlayoff:true });
  assert.equal(e.money.cash, cash, 'playoffs must not pay the regular-season contract a second time');
  assert.equal(e.money.earned - e.money.spent, e.money.cash);
}

{
  const f = fixture(), e = f.api.getState();
  choose(f, 'brand_day');
  assert.equal(e.money.offcourt, 180000);
  assert.equal(e.money.cash, 180000);
  choose(f, 'team_evening');
  assert.equal(e.money.cash, 145000);
  assert.equal(e.money.spent, 35000);
  assert.equal(f.api.getModifiers().load, 2);
  assert.equal(f.api.getCoachAuthority().allowed, false);
  choose(f, 'rotation_identity');
  assert.equal(f.api.getCoachAuthority().allowed, true, 'spending and team cooperation must reach the high-chemistry coach unlock');
  const candidates = f.api.getCoachCandidates();
  assert.equal(candidates.length, 5);
  assert.equal(f.api.hireCoach('not-a-coach'), false);
  const oldPace = f.context.getTeamSystemEffects('LAL').pace;
  assert.equal(f.api.hireCoach('seven_seconds'), true);
  assert.notEqual(f.context.getTeamSystemEffects('LAL').pace, oldPace);
  assert.equal(f.state.teamSystems.LAL, 'seven_seconds');
  assert.equal(f.api.hireCoach('twin_towers'), false, 'only one management recommendation per team and season');
}

{
  const f = fixture(99);
  assert.equal(f.api.getCoachAuthority().allowed, true, 'an actual team-leading superstar must unlock influence');
  const baseline = [], coached = [];
  vm.runInContext(liveSource, f.context, { filename:'perfect-player-live-sim.js' });
  const liveBaseline = [];
  for (let i = 1; i <= 6; i++) {
    vm.runInContext('_rngState={s:' + i + ',c:0}', f.context);
    liveBaseline.push(f.context.PP_LIVE.run('LAL','BOS',{}).result.pace);
  }
  for (let i = 1; i <= 24; i++) {
    vm.runInContext('_rngState={s:' + i + ',c:0}', f.context);
    baseline.push(f.context.simulate82StyleMatchup('LAL', 'BOS', { includeBoxScore:false }).pace);
  }
  assert.equal(f.api.hireCoach('seven_seconds'), true);
  for (let i = 1; i <= 24; i++) {
    vm.runInContext('_rngState={s:' + i + ',c:0}', f.context);
    coached.push(f.context.simulate82StyleMatchup('LAL', 'BOS', { includeBoxScore:false }).pace);
  }
  assert.ok(coached.reduce((a,b)=>a+b,0) > baseline.reduce((a,b)=>a+b,0), 'coaching must change actual production match pace');
  const liveCoached = [];
  for (let i = 1; i <= 6; i++) {
    vm.runInContext('_rngState={s:' + i + ',c:0}', f.context);
    liveCoached.push(f.context.PP_LIVE.run('LAL','BOS',{}).result.pace);
  }
  assert.ok(liveCoached.reduce((a,b)=>a+b,0) > liveBaseline.reduce((a,b)=>a+b,0), 'the same coaching choice must also change the full watched-game engine');
}

{
  const f = fixture(), e = f.api.getState();
  e.pending = { id:'team_evening', key:'insufficient' };
  assert.equal(f.api.choose(0), false, 'insufficient cash must leave the whole choice unchanged');
  assert.equal(e.money.cash, 0);
  assert.equal(f.context.getNextSeasonMods().teamChemistry, 0);
  assert.ok(e.pending);
}

{
  const f = fixture();
  f.state.career.totalStats.pts = 12000;
  f.state.career.totalStats.games = 500;
  const oldAttrs = JSON.stringify(f.state.attrs), oldOvr = f.state.finalOVR;
  const e = f.api.getState();
  assert.equal(e.money.earned, 0, 'old saves must not receive invented retrospective earnings');
  choose(f, 'rotation_tryout');
  f.api.settleGame('saved-game', { mins:24, pts:12 }, { won:true }, {});
  const saved = JSON.stringify(f.state);
  const reloaded = fixture();
  Object.assign(reloaded.state, JSON.parse(saved));
  assert.equal(reloaded.api.getModifiers().minutes, 6);
  assert.equal(reloaded.api.getState().effects[0].gamesLeft, 2);
  assert.equal(reloaded.api.settleGame('saved-game', {}, {}, {}), false);
  assert.equal(JSON.stringify(reloaded.state.attrs), oldAttrs);
  assert.equal(reloaded.state.finalOVR, oldOvr);
  assert.equal(reloaded.state.career.totalStats.pts, 12000);
  reloaded.state.career.seasonCount++;
  assert.equal(reloaded.api.getModifiers().minutes, 0, 'an offseason must end a temporary rotation arrangement');
  assert.equal(reloaded.api.getState().money.earned, e.money.earned);
}

{
  const c = { window:{} };
  vm.createContext(c);
  vm.runInContext(read('assets/js/perfect-player-event-library.js'), c);
  const choice = c.window.PERFECT_PLAYER_EXTRA_SEASON_EVENT_DEFINITIONS.find(x=>x.id === 'unique_trainer_dispute').choices[0];
  assert.match(choice.hint, /伤病风险下降/);
  assert.match(choice.hint, /体能负荷下降/);
}

{
  const f = fixture(), c = f.context;
  choose(f, 'rotation_tryout');
  let written = null, restarted = 0;
  c.storageSet = async (_key, value) => { written = JSON.parse(value); };
  c.renderAfterSaveLoad = () => restarted++;
  c.renderMenuSavePanel = () => {};
  c.showManualSaveToast = () => {};
  await c.manualSaveGame(1);
  assert.ok(written, 'the actual manual save must write a snapshot');
  assert.equal(restarted, 0, 'saving must not restart or rebuild the ongoing simulation');
  assert.equal(written.state.career.eventExperience.effects[0].gamesLeft, 3);

  const nodes = {};
  c.html = id => nodes[id] ||= { innerHTML:'' };
  c.ensurePulseBoard = () => {};
  c.refreshPulseBoard = () => {};
  f.state.season.wins = 2; f.state.season.losses = 1;
  f.state.season.playerStats = { games:3, pts:53, reb:11, ast:17 };
  c.renderSeasonScreenDOM();
  assert.match(nodes['season-header'].innerHTML, /sh-wins">2/);
  assert.match(nodes['season-header'].innerHTML, /sh-losses">1/);
  assert.match(nodes['season-header'].innerHTML, /66.7%/);
  assert.match(nodes['season-header'].innerHTML, /场均 17.7分 3.7板 5.7助/);
}

console.log('Career events passed: ' + choicesChecked + ' real choices, direct/live minute caps, effect expiry, duplicate settlements, DNP salary, offcourt spending, coach unlock and production pace, reload and old-save preservation.');
