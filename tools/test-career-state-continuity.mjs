import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

{
  const html=read('nba-perfect-player.html'),scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const values=new Map(),storageContext={window:{},localStorage:{
    getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)
  },btoa:text=>Buffer.from(text,'binary').toString('base64'),atob:text=>Buffer.from(text,'base64').toString('binary'),setTimeout};
  vm.createContext(storageContext);
  vm.runInContext(scripts.find(s=>s.includes('var PROJECT_ID')),storageContext);
  vm.runInContext(scripts.find(s=>s.includes('var Storage =')),storageContext);
  const payload='大型季后赛快照'.repeat(40000);
  await storageContext.Storage.setValue({lenf_auto_slot:payload});
  assert.equal(await storageContext.Storage.getValue('lenf_auto_slot'),payload,'browser saves over 200KB must reach actual storage');
  storageContext.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
  await assert.rejects(storageContext.Storage.setValue({lenf_auto_slot:'new'}),/QuotaExceededError/,'quota failure must reach the caller instead of reporting success');
  assert.equal(await storageContext.Storage.getValue('lenf_auto_slot'),payload,'failed writes must preserve the old save');
}

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

{
  const f = fixture(), c = f.context;
  c.captureBaseLeagueRoster();
  f.state.mode='legend'; f.state.eraStart=2003; c.applyLegendEraLeague();
  assert.equal(f.teams.length,29);
  await c.manualSaveGame(1);
  const raw=f.storage.get(c.MANUAL_SAVE_KEYS[0]);
  c.restoreBaseLeagueRoster();
  assert.equal(f.teams.length,30);
  await c.manualLoadGame(1);
  assert.equal(f.teams.length,29, 'the saved active-team list must survive restoration');
  assert.ok(!f.teams.includes('CHA'));
  const legacy=JSON.parse(raw); delete legacy.leagueTeams;
  f.storage.set(c.MANUAL_SAVE_KEYS[0],JSON.stringify(legacy));
  await c.manualLoadGame(1);
  assert.equal(f.teams.length,29, 'older saves infer active teams from their own saved league');
}

{
  const f = fixture(), c = f.context, callbacks=[], elements=new Map();
  c.document.getElementById = id => {
    if (!['simStatus','simRecord','simDotGrid','simInfo'].includes(id)) return f.modals.get(id) || null;
    if(!elements.has(id))elements.set(id,{style:{},innerHTML:'',textContent:'',className:''});
    return elements.get(id);
  };
  c.ensurePulseBoard=c.refreshPulseBoard=()=>{};
  c.checkRandomEvents=c.checkSeasonBranchEvent=()=>null;
  c.PP_CAREER_EVENTS.pauseForCoach=()=>false;
  const keys=['pts','reb','ast','stl','blk','tov','fgm','fga','ftm','fta','threeM','threeA','games','mins'];
  f.state.season={wins:0,losses:0,games:[],standings:{},playerStats:Object.fromEntries(keys.map(k=>[k,0])),playoffStats:{games:0},events:{injuryGamesLeft:0,suspensionGamesLeft:0,triggeredIds:[],storyTimeline:[]},isUserStarter:true};
  c.initStandings(); c.buildRealSchedule();
  f.state.season.schedule=f.state.season.schedule.slice(0,2);
  f.timers.length=0;
  c.liveOrSkipUserPack=()=>{throw new Error('fixture pack failure');};
  c.quickSimAllGames();
  assert.match(elements.get('simStatus').innerHTML,/重试本场/);
  assert.equal(f.state.season.schedule[0].simulated,false,'an error must not silently skip an unfinished match');
  c.liveOrSkipUserPack=(opponent,options,done)=>{callbacks.push({opponent,options,done});return true;};
  c.quickSimAllGames(); c.quickSimAllGames();
  assert.equal(callbacks.length,1,'repeated launch must not create parallel simulation callbacks');
  const first=callbacks[0], pack=c.skipUserGamePack(first.opponent,false);
  first.done(pack);
  assert.equal(f.state.season.games.length,1);
  const settled=JSON.stringify({season:f.state.season,money:c.PP_CAREER_EVENTS.getState().money});
  first.done(pack);
  assert.equal(JSON.stringify({season:f.state.season,money:c.PP_CAREER_EVENTS.getState().money}),settled,'a repeated result callback must not duplicate stats or income');
  f.timers.shift()();
  assert.equal(callbacks.length,2);
  const stale=callbacks[1], stalePack=c.skipUserGamePack(stale.opponent,false);
  assert.equal(await c.manualSaveGame(1),true);
  await c.manualLoadGame(1);
  assert.equal(f.toasts.at(-1),'已恢复上局游戏');
  const restored=JSON.stringify({season:f.state.season,money:c.PP_CAREER_EVENTS.getState().money});
  stale.done(stalePack);
  assert.equal(JSON.stringify({season:f.state.season,money:c.PP_CAREER_EVENTS.getState().money}),restored,'a result from before loading must not mutate the restored career');
  c.quickSimAllGames();
  assert.equal(callbacks.length,3,'the restored season can start a fresh run');
  callbacks[2].done(c.skipUserGamePack(callbacks[2].opponent,false));
  assert.equal(f.state.season.games.length,2);
  assert.equal(f.state.season.playerStats.games,2);
}

{
  const f=fixture(),c=f.context,callbacks=[],elements=new Map();
  c.document.getElementById=id=>{
    if(!['simStatus','simRecord','simDotGrid','simInfo'].includes(id))return f.modals.get(id)||null;
    if(!elements.has(id))elements.set(id,{style:{},innerHTML:'',textContent:''});return elements.get(id);
  };
  c.ensurePulseBoard=c.refreshPulseBoard=()=>{};c.checkRandomEvents=c.checkSeasonBranchEvent=()=>null;c.PP_CAREER_EVENTS.pauseForCoach=()=>false;
  const keys=['pts','reb','ast','stl','blk','tov','fgm','fga','ftm','fta','threeM','threeA','games','mins'];
  f.state.season={wins:0,losses:0,games:[],standings:{},playerStats:Object.fromEntries(keys.map(k=>[k,0])),playoffStats:{games:0},events:{injuryGamesLeft:0,suspensionGamesLeft:0,triggeredIds:[],storyTimeline:[]},isUserStarter:true};
  c.initStandings();c.buildRealSchedule();f.state.season.schedule=f.state.season.schedule.slice(0,3);f.timers.length=0;
  c.liveOrSkipUserPack=(opponent,options,done)=>{callbacks.push({opponent,done});return true;};
  c.quickSimAllGames();assert.equal(callbacks.length,1);
  c.pauseSeasonSimulation();
  callbacks[0].done(c.skipUserGamePack(callbacks[0].opponent,false));
  f.timers.shift()();
  assert.equal(f.state.season.games.length,1);assert.equal(callbacks.length,1,'pausing must stop the next match from starting');
  await c.manualSaveGame(1);await c.manualLoadGame(1);
  assert.equal(f.state.season.simulationPaused,true,'loading a paused season must preserve its pause');
  c.quickSimAllGames();assert.equal(callbacks.length,1);
  c.resumeSeasonSimulation(true);assert.equal(callbacks.length,2);
  callbacks[1].done(c.skipUserGamePack(callbacks[1].opponent,false));
  assert.equal(f.state.season.simulationPaused,true);assert.equal(f.state.season.games.length,2);
  while(f.timers.length)f.timers.shift()();
  assert.equal(callbacks.length,2,'single-game advance must return to the pause');
  c.resumeSeasonSimulation(false);assert.equal(callbacks.length,3);
  const pack=c.skipUserGamePack(callbacks[2].opponent,false);callbacks[2].done(pack);callbacks[2].done(pack);
  assert.equal(f.state.season.games.length,3);assert.equal(f.state.season.playerStats.games,3);
}

{
  const f=fixture(),c=f.context,s=f.state;
  s.finalOVR=80;s.attrs=Object.fromEntries(Object.keys(s.attrs).map(k=>[k,k==='STA'?0:80]));s.career.currentAge=22;
  s.season._usageBias=1;s.season.isUserStarter=false;s._draftPending={round:1,pick:10,type:'lottery',contractYears:4};
  const savedRandom=c.Math.random;
  c.Math.random=()=>0.743;
  const minutes=c.getPlayerRotationPlan(s.attrs,s.position,false),defense=c.getCareerTeamGameModifiers('LAL','BOS').defense;
  assert.equal(c.getTeamRenewalWillingness(),false);
  c.showDraftAgentStep();c.chooseDraftChoice(1);c.chooseDraftChoice(1);
  assert.equal(s.career.profile.coachTrust,1,'the actual draft choice must apply exactly once');
  assert.ok(c.getPlayerRotationPlan(s.attrs,s.position,false)>minutes,'coach trust must reach the real rotation planner');
  assert.ok(c.getCareerTeamGameModifiers('LAL','BOS').defense>defense,'coach trust must reach the modifiers read by both engines');
  assert.equal(c.getTeamRenewalWillingness(),true,'the real renewal decision must read the chosen trust value');
  c.Math.random=savedRandom;
  const modifierGetter=c.getCareerTeamGameModifiers,reads=[];
  c.getCareerTeamGameModifiers=(...args)=>{const value=modifierGetter(...args);if(args[0]==='LAL')reads.push(value.defense);return value;};
  c.skipUserGamePack('BOS',false);
  assert.ok(reads.some(value=>value>defense),'direct games must read the trust-enhanced defense');
  reads.length=0;vm.runInContext(read('assets/js/perfect-player-live-sim.js'),c);
  c.PP_LIVE.run('LAL','BOS',{attrs:s.attrs});
  assert.ok(reads.some(value=>value>defense),'watched games must read the same trust-enhanced defense');
  assert.match(f.modals.get('draft-result-modal').html,/教练信任[\s\S]*\+1[\s\S]*→ 1/);
  assert.match(f.modals.get('draft-result-modal').html,/轮换倾向[\s\S]*\+0\.1%/);
  assert.match(c.renderCareerExperienceStrip(false),/data-status-key="coachTrust"[\s\S]*教练信任 1/);
  assert.match(c.renderCareerExperienceStrip(true),/教练信任 1/);
  c.openCareerInfluencePanel();assert.match(f.modals.get('career-influence-modal').html,/续约意愿[\s\S]*\+0\.6 个百分点/);
  s.season.pauseAfterNextGame=true;f.api=c.PP_CAREER_EVENTS;
  f.api.prepareGame('BOS',{},()=>{},()=>{});
  c.showCareerExperienceModal('career-coach-modal','主教练','<button>返回</button>');
  const preparedModal=f.modals.get('career-pregame-modal');
  c.openCareerInfluencePanel();c.closeCareerInfluencePanel();
  assert.equal(f.modals.get('career-pregame-modal'),preparedModal,'closing relations must reveal the original caller instead of rebuilding a different panel');
  assert.ok(f.modals.has('career-coach-modal'));
  await c.manualSaveGame(1);s.career.profile.coachTrust=0;await c.manualLoadGame(1);
  assert.equal(s.career.profile.coachTrust,1);assert.equal(f.modals.has('career-influence-modal'),false);
  c.addProfileDelta('businessValue',20);c.openCareerInfluencePanel('businessValue');
  assert.match(f.modals.get('career-influence-modal').html,/open><summary>场外机会/);
  assert.match(f.modals.get('career-influence-modal').html,/自由市场报价 \+1 份/);
  c.addSeasonMod('formVariance',-1);c.openCareerInfluencePanel('formVariance');
  assert.match(f.modals.get('career-influence-modal').html,/open><summary>本季状态/);
}

{
  const f=fixture(),c=f.context,s=f.state,callbacks=[];
  s.season.isPlayoffs=true;s.season.playoffStats=Object.fromEntries(['pts','reb','ast','stl','blk','tov','fgm','fga','ftm','fta','threeM','threeA','mins','games'].map(k=>[k,0]));
  s.season.playoffBracket={rounds:[[{high:{team:'LAL'},low:{team:'BOS'},winner:null}],[null,null],[null],[null]],results:[],teams:[{team:'LAL',seed:1},{team:'BOS',seed:8}]};
  c.document.querySelector=()=>({id:'screen-playoffs'});c.renderPlayoffBracketUI=c.renderPlayoffGameBrief=c.clearPlayoffGamecast=()=>{};
  c.showPlayoffGameDataPanel=()=>{};
  c.liveOrSkipUserPack=(opponent,options,done)=>callbacks.push({opponent,options,done});
  c.simPlayoffSeries(0,0);
  assert.equal(callbacks[0].options.title,'首轮 G1');
  const pack=c.skipUserGamePack('BOS',true);callbacks[0].done(pack);callbacks[0].done(pack);
  assert.equal(s.season.playoffStats.games,1,'duplicate playoff callbacks must not count twice');
  assert.equal(s.season.playoffBracket.rounds[0][0].progress.seriesGames.length,1);
  await c.manualSaveGame(1);await c.manualLoadGame(1);
  c.simPlayoffSeries(0,0);
  assert.equal(callbacks[1].options.title,'首轮 G2','saved series must resume the next game instead of replaying G1');
  callbacks[0].done(pack);
  assert.equal(s.season.playoffStats.games,1,'callbacks owned by the pre-load season must stop');
  callbacks[1].done(c.skipUserGamePack('BOS',true));
  assert.equal(s.season.playoffStats.games,2);
  assert.equal(s.season.playoffBracket.rounds[0][0].progress.seriesGames.length,2);
}

console.log('Career state continuity passed: actual draft choices, visible trust and effects, both game engines, renewal decisions and persistence; injury/coach consistency, large storage and quota failures, pause, duplicate/stale results and playoff checkpoints.');
