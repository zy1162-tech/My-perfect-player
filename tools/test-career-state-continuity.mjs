import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

function fixture() {
  const f = createSimulation('current', 73), c = f.context;
  c.HUPU_USER = {nickname:'Continuity Test Player',avatar:'',isLogin:false};
  c.getHupuDisplayName = () => c.HUPU_USER.nickname;
  const originalAutoSave = c.autoSaveGame;
  c.autoSaveGame = () => Promise.resolve(true);
  f.state.position = 'SG'; f.state.careerTeam = 'LAL'; f.state.finalOVR = 96;
  f.state.attrs = Object.fromEntries(['FIN','MID','threePT','DNK','HAN','PAS','PDEF','IDEF','REB','BLK','STL','ATH','STR','CLU','STA'].map(k => [k, k === 'STA' ? 0 : 96]));
  f.state.career = c.createFreshCareer();
  f.state.career.currentAge = 35;
  f.state.season = { games:[{stats:{mins:24,pts:12}}], schedule:[{opponent:'BOS',day:0,simulated:true},{opponent:'BOS',day:1}],
    events:{injuryGamesLeft:0,injuryRiskBonus:0}, playerStats:{games:1,pts:12}, playoffStats:{games:0}, wins:1, losses:0 };
  const storage = new Map(), modals = new Map(), timers = [], toasts = [];
  c.document.querySelector = () => ({id:'screen-season'});
  c.document.getElementById = id => modals.get(id) || null;
  c.document.body.insertAdjacentHTML = (_where, html) => {
    const match = /id="([^"]+-modal)"/.exec(html);
    if (match) modals.set(match[1], {html, remove:() => modals.delete(match[1]), querySelector:() => ({focus(){}})});
  };
  c.renderMenuSavePanel = c.refreshContinueActivityButton = c.refreshPlayerStateStripLive = () => {};
  c.renderSeasonScreenDOM = () => {};
  c.showManualSaveToast = text => toasts.push(text);
  c.storageSet = async (key, value) => storage.set(key, value);
  c.storageGet = async key => storage.get(key);
  c.setTimeout = fn => { timers.push(fn); return timers.length; };
  for (const file of ['perfect-player-career-events.js','perfect-player-event-runtime.js','perfect-player-event-library.js','perfect-player-story-events.js','perfect-player-era-story.js']) {
    vm.runInContext(read('assets/js/' + file), c, {filename:file});
  }
  return {...f, storage, modals, timers, toasts, originalAutoSave};
}

{
  const f = fixture(), c = f.context;
  const before = c.getSeasonInjuryEventRate(), majorBefore = c.getMajorInjuryEventRate();
  c.showSeasonBranchEvent(c.getBranchEventById('fan_culture_score'));
  c.chooseSeasonBranchEvent(0);
  assert.ok(c.getSeasonInjuryEventRate() < before, 'a real recovery choice must immediately reduce the injury rate used by games');
  assert.ok(c.getMajorInjuryEventRate() < majorBefore);
  assert.equal(c.getCurrentPlayerLongevityContext().injuryRiskBonus, -1);
  c.addSeasonMod('injuryRiskBonus', 3, -4, 8);
  assert.ok(c.getSeasonInjuryEventRate() > before);
  f.state.season.events.injuryRiskBonus = 7;
  assert.equal(c.getCurrentPlayerLongevityContext().injuryRiskBonus, 2, 'legacy caches must not count the same risk twice');
  const rate = c.getSeasonInjuryEventRate();
  assert.equal(c.getNextSeasonMods(), c.getNextSeasonMods(), 'reading state must keep the same object so a caller cannot mutate a detached copy');
  await c.manualSaveGame(1);
  f.state.career.nextSeasonMods.injuryRiskBonus = 0;
  await c.manualLoadGame(1);
  assert.equal(f.toasts.at(-1), '已恢复上局游戏');
  assert.equal(c.getSeasonInjuryEventRate(), rate);
  assert.equal(c.getCurrentPlayerLongevityContext().injuryRiskBonus, 2);
  delete f.state.career.nextSeasonMods.injuryRiskBonus;
  f.state.season.events.injuryRiskBonus = 3;
  assert.equal(c.getNextSeasonMods().injuryRiskBonus, 3, 'old saves lacking the canonical value must migrate their cached value once');
  f.state.season.events.injuryRiskBonus = 8;
  assert.equal(c.getNextSeasonMods().injuryRiskBonus, 3);
}

{
  const f = fixture(), c = f.context, e = c.PP_CAREER_EVENTS.getState();
  c.getNextSeasonMods().teamChemistry = 6;
  assert.equal(c.PP_CAREER_EVENTS.hireCoach('seven_seconds'), true);
  c.chooseTeamSystem('five_out');
  assert.equal(c.getTeamSystemEffects('LAL').name, '五外空间');
  assert.equal(e.coaches.LAL.id, 'five_out');
  assert.equal(e.coaches.LAL.name, '五外空间教练');
  assert.match(c.PP_CAREER_EVENTS.renderStateStrip(), /主教练：五外空间教练/);
  let refreshed = 0;
  c.refreshPlayerStateStripLive = () => refreshed++;
  c.chooseTeamSystem('five_out');
  assert.equal(refreshed, 1, 'the existing system chooser must refresh the visible career status');
  // Recreate a previously inconsistent save and restore through the actual load function.
  e.coaches.LAL.id = 'seven_seconds'; e.coaches.LAL.name = '七秒进攻教练';
  await c.manualSaveGame(1);
  await c.manualLoadGame(1);
  assert.equal(c.PP_CAREER_EVENTS.getState().coaches.LAL.id, 'five_out');
  assert.match(c.PP_CAREER_EVENTS.renderStateStrip(), /主教练：五外空间教练/);
}

for (const legacy of [false, true]) {
  const f = fixture(), c = f.context, event = c.getBranchEventById('media_first_press');
  let abandoned = 0, resumed = 0;
  c.quickSimAllGames = () => resumed++;
  c.showSeasonBranchEvent(event, () => abandoned++);
  await c.manualSaveGame(1);
  const key = c.MANUAL_SAVE_KEYS[0], snap = JSON.parse(f.storage.get(key));
  assert.equal(snap.state._seasonBranchEventId, event.id);
  assert.equal(snap.state._seasonBranchEvent, undefined, 'new snapshots must only persist the event id');
  assert.equal(snap.state._seasonBranchDone, undefined);
  if (legacy) {
    snap.v = 1; delete snap.state._seasonBranchEventId;
    snap.state._seasonBranchEvent = JSON.parse(JSON.stringify(event));
    assert.equal(snap.state._seasonBranchEvent.choices[0].apply, undefined);
    f.storage.set(key, JSON.stringify(snap));
  }
  const attrs = JSON.stringify(f.state.attrs), ovr = f.state.finalOVR;
  f.state._seasonBranchEventId = null;
  await c.manualLoadGame(1);
  assert.ok(f.modals.has('season-branch-modal'), 'restoring must display the pending event before resuming games');
  assert.equal(f.timers.length, 0, 'simulation must wait for the restored choice');
  c.chooseSeasonBranchEvent(0);
  assert.equal(c.getBranchNode('media'), 'press_accountable');
  assert.equal(f.state.career.profile.mediaTrust, 2);
  assert.equal(f.state.career.profile.lockerRoomTrust, 1);
  c.chooseSeasonBranchEvent(0);
  assert.equal(f.state.career.profile.mediaTrust, 2, 'a second click must not apply the choice twice');
  c.finishSeasonBranchEvent();
  f.timers.splice(0).forEach(fn => fn());
  assert.equal(resumed, 1);
  assert.equal(abandoned, 0, 'a callback belonging to the abandoned run must not survive loading');
  assert.equal(JSON.stringify(f.state.attrs), attrs);
  assert.equal(f.state.finalOVR, ovr);
  await c.manualSaveGame(1);
  await c.manualLoadGame(1);
  assert.equal(f.state.career.profile.mediaTrust, 2, 'reloading after a choice must retain it without replaying it');
  assert.equal(f.state.career.branchHistory.length, 1);
}

{
  const f = fixture(), c = f.context;
  f.state._offseasonQueue = ['training_camp_open', 'team_practice_start'];
  f.state._offseasonEventIdx = 1; f.state._branchScenePage = 1;
  await c.manualSaveGame(1);
  const key = c.MANUAL_SAVE_KEYS[0], snap = JSON.parse(f.storage.get(key));
  // A legacy queue stored full event objects, including choices whose functions were lost.
  snap.state._offseasonQueue = snap.state._offseasonQueue.map(id => JSON.parse(JSON.stringify(c.getBranchEventById(id))));
  snap.state._offseasonQueue.splice(1, 0, {id:'story_allstar_game',branch:'allstar_story'});
  snap.state._offseasonEventIdx = 2;
  snap.state._seasonBranchEvent = {id:'story_allstar_game',branch:'allstar_story'};
  f.storage.set(key, JSON.stringify(snap));
  await c.manualLoadGame(1);
  assert.deepEqual(Array.from(f.state._offseasonQueue), ['training_camp_open', 'team_practice_start']);
  assert.equal(f.state._offseasonEventIdx, 1);
  assert.equal(f.state._branchScenePage, 1);
  assert.equal(f.state._seasonBranchEventId, null, 'already removed storylines must retain their existing compatibility behavior');
  assert.ok(f.modals.has('offseason-event-modal'));
  const before = c.getSeasonInjuryEventRate();
  c.chooseOffseasonEvent(1); // Directly writes the season modifier in the original event definition.
  assert.equal(c.getBranchNode('team_practice'), 'practice_start');
  assert.equal(c.getNextSeasonMods().injuryRiskBonus, -1);
  assert.ok(c.getSeasonInjuryEventRate() < before);
  assert.equal(f.state._offseasonEventIdx, 2);
  assert.equal(f.state.career.offseasonHistory.length, 1);
}

{
  const f = fixture(), c = f.context;
  f.state.mode = 'legend'; f.state.eraStart = 2010;
  assert.equal(c.PP_ERA_STORY.showPrologueIfDue(), false, 'an established save must not receive an unsolicited prologue');
  c.showSeasonBranchEvent(c.PP_ERA_STORY.getPrologueEvent(2010));
  await c.manualSaveGame(2);
  await c.manualLoadGame(2);
  c.chooseSeasonBranchEvent(0);
  assert.equal(c.PP_ERA_STORY.getPrologueStatus().completed, true, 'a dynamically created prologue must resolve to executable choices after loading');
}

{
  const f = fixture(), c = f.context, jobs = [], writes = [];
  c.autoSaveGame = f.originalAutoSave;
  c.CompressionStream = c.DecompressionStream = function() {};
  c.compressText = raw => new Promise(resolve => jobs.push({raw, resolve}));
  c.decompressText = async text => text;
  c.storageSet = async (key, raw) => {
    writes.push(JSON.parse(raw).d ? JSON.parse(JSON.parse(raw).d).state.career.checkpoint : JSON.parse(raw).state.career.checkpoint);
    f.storage.set(key, raw);
  };
  f.state.career.checkpoint = 'old-auto';
  const first = c.autoSaveGame();
  await Promise.resolve();
  f.state.career.checkpoint = 'new-manual';
  const second = c.manualSaveGame(1);
  const loaded = c.manualLoadGame(1); // Also verify a rapid restore waits for both requests.
  await Promise.resolve();
  assert.equal(jobs.length, 1, 'the newer compressor must wait for the earlier write');
  assert.equal(f.storage.size, 0);
  jobs[0].resolve(jobs[0].raw);
  await first;
  assert.equal(jobs.length, 2);
  jobs[1].resolve(jobs[1].raw);
  assert.equal(await second, true);
  await loaded;
  assert.deepEqual(writes, ['old-auto', 'new-manual']);
  assert.equal(f.state.career.checkpoint, 'new-manual');
  assert.equal(f.toasts.at(-1), '已恢复上局游戏');

  // A failed write must be reported and must not poison the next request.
  delete c.CompressionStream; delete c.DecompressionStream;
  let fail = true;
  c.storageSet = async (key, raw) => { if (fail) { fail = false; throw new Error('disk full'); } f.storage.set(key, raw); };
  assert.equal(await c.manualSaveGame(1), false);
  assert.match(f.toasts.at(-1), /保存失败：disk full/);
  f.state.career.checkpoint = 'recovered';
  assert.equal(await c.manualSaveGame(1), true);
  assert.equal(JSON.parse(f.storage.get(c.MANUAL_SAVE_KEYS[0])).state.career.checkpoint, 'recovered');
}

console.log('Career state continuity passed: live injury modifiers, legacy risk migration, coach/system consistency, new and old pending season saves, offseason queues, prologue restoration, request-ordered saves, rapid loading and write failure recovery.');
