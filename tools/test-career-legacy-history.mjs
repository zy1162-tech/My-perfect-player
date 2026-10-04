import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createSimulation} from './bench-era-baseline.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

function fixture(era='current') {
  const f=createSimulation(era,510),c=f.context,s=f.state;
  c.HUPU_USER={nickname:'传承测试',avatar:'',isLogin:false};c.getHupuDisplayName=()=>c.HUPU_USER.nickname;
  s.career=c.createFreshCareer();s.careerTeam='LAL';s.position='SG';s.finalOVR=90;
  s.attrs=Object.fromEntries(vm.runInContext('ATTR_KEYS',c).map(k=>[k,85]));
  c.document.readyState='complete';c.revealPlayer=()=>{};
  vm.runInContext(read('assets/js/perfect-player-enhancements.js'),c);
  c.PP_FX._suppressAchievementPopups=true;
  vm.runInContext(read('assets/data/nba-award-history.js'),c);
  vm.runInContext(read('assets/js/perfect-player-season-report.js'),c);
  vm.runInContext(read('assets/js/perfect-player-live-sim.js'),c);
  return f;
}
{
  const f=fixture(),c=f.context,s=f.state,fx=c.PP_FX;
  fx.respecLegacy();assert.equal(fx.buyPerk('scorer'),true);assert.equal(fx.buyPerk('floor_general'),true);assert.equal(fx.buyPerk('leader'),true);
  c.revealPlayer();
  assert.equal(s.attrs.threePT,86);assert.equal(s.career.legacySnapshot.levels.scorer,1);
  const attrs=JSON.stringify(s.attrs),effects=JSON.stringify(fx.getLegacySimulationEffects({_isUser:true}));
  const boost=fx.getLegacyTeamBoost('LAL');assert.equal(boost,.5);
  function match(engine){vm.runInContext('_rngState={s:12340,c:0}',c);c.clearLineupCache();const game=engine==='watch'?c.PP_LIVE.run('LAL','BOS',{fast:true}):c.simulate82StyleMatchup('LAL','BOS');return JSON.stringify(game.result||game);}
  // The first watched game initializes production player-age/rotation caches.
  match('watch');
  const skip=match('skip'),watch=match('watch');
  assert.equal(match('watch'),watch,'the fixture must be repeatable before testing purchases');
  assert.equal(fx.buyPerk('scorer'),true);assert.equal(fx.buyPerk('floor_general'),true);assert.equal(fx.buyPerk('leader'),true);
  c.revealPlayer();assert.equal(JSON.stringify(s.attrs),attrs,'reveal cannot apply legacy attributes twice');
  assert.equal(JSON.stringify(fx.getLegacySimulationEffects({_isUser:true})),effects);assert.equal(fx.getLegacyTeamBoost('LAL'),boost);
  assert.equal(match('skip'),skip,'account purchases must not change current skip-engine results');
  assert.equal(match('watch'),watch,'account purchases must not change current watch-engine results');
  fx.respecLegacy();assert.equal(JSON.stringify(fx.getLegacySimulationEffects({_isUser:true})),effects);
  const snap=c.buildManualSaveSnapshot();s.career=JSON.parse(JSON.stringify(snap.state.career));
  assert.equal(JSON.stringify(fx.getLegacySimulationEffects({_isUser:true})),effects);
  s.career=c.createFreshCareer();s.attrs=Object.fromEntries(vm.runInContext('ATTR_KEYS',c).map(k=>[k,85]));
  fx.buyPerk('scorer');fx.buyPerk('scorer');c.revealPlayer();assert.equal(s.attrs.threePT,87,'the next player receives the new purchase configuration');
  delete s.career.legacySnapshot;const oldAttrs=JSON.stringify(s.attrs),lp=fx.availableLP();
  fx.freezeLegacySnapshot(s);assert.equal(JSON.stringify(s.attrs),oldAttrs);assert.equal(fx.availableLP(),lp);
}
{
  const f=fixture(2003),c=f.context,s=f.state,api=c.PP_SEASON_REPORT;
  s.season={awards:[{act:'mvp',winner:'凯文-加内特',winnerEN:'Kevin Garnett',isUser:false}],finalsMvp:{name:'昌西-比卢普斯',nameEN:'Chauncey Billups',isUser:false}};
  const row=api.captureLeagueHonors(s,1);api.captureLeagueHonors(s,1);assert.equal(Object.keys(s.career.leagueHonors).length,1);
  const before=JSON.stringify(s),rng=vm.runInContext('JSON.stringify(_rngState)',c);
  const timeline=api._test.buildHonorTimeline(s),duncan=timeline.rows.find(r=>r.key==='timduncan');
  assert.equal(duncan.game.mvp,2);assert.equal(duncan.game.fmvp,2,'pre-opening awards are part of the game timeline');
  const kg=timeline.rows.find(r=>r.key==='kevingarnett');assert.equal(kg.game.mvp,1);assert.equal(kg.real.mvp,1);
  assert.equal(timeline.complete.mvp,true);assert.equal(timeline.complete.fmvp,true);
  api.renderHonorTimeline(s);assert.equal(JSON.stringify(s),before);assert.equal(vm.runInContext('JSON.stringify(_rngState)',c),rng,'viewing historical comparisons never changes saves or RNG');
  s.career.seasonCount=1;s._careerSaved=true;s.career.seasons=[{seasonNum:1,awards:[],finalsMvp:s.season.finalsMvp,leagueHonors:row}];
  delete s.career.leagueHonors;api.normalizeLoadedState(s);assert.equal(s.career.leagueHonors[1].mvp.key,'kevingarnett');
}
{
  const f=fixture(2010),c=f.context,s=f.state,api=c.PP_SEASON_REPORT;
  s.career.seasonCount=1;s._careerSaved=true;s.career.seasons=[{seasonNum:1,awards:[],finalsMvp:{name:'德克',nameEN:'Dirk Nowitzki',isUser:false}}];
  api.normalizeLoadedState(s);const timeline=api._test.buildHonorTimeline(s);
  assert.equal(timeline.complete.mvp,false);assert.equal(timeline.complete.fmvp,true);
  const kobe=timeline.rows.find(r=>r.key==='kobebryant');assert.equal(kobe.game.fmvp,2);assert.equal(kobe.real.fmvp,2);
  assert.match(api.renderHonorTimeline(s),/未完整记录/);
  s.career.seasonCount=17;const future=api._test.buildHonorTimeline(s);assert.equal(future.future,true);assert.equal(future.rows[0].real.mvp,null);
  assert.match(api.renderHonorTimeline(s),/尚无现实赛果/);
}
for(const era of ['current',2016]) {
  const f=fixture(era),c=f.context,s=f.state,api=c.PP_SEASON_REPORT;
  s.season.awards=[{act:'mvp',winner:'传承测试',winnerEN:'Kobe Bryant',isUser:true}];s.season.finalsMvp={name:'传承测试',nameEN:'Stephen Curry',isUser:true};
  const ledger=api.captureLeagueHonors(s,1);assert.equal(ledger.mvp.key,'user');assert.equal(ledger.fmvp.key,'user','a user named like a real player cannot steal their identity');
  const timeline=api._test.buildHonorTimeline(s);assert.equal(timeline.future,era==='current');
}
console.log('career legacy/history: frozen attributes and both engines, next player, saved configurations, actual winners, baselines, old gaps and future seasons passed');
