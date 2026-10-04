import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

for (const era of ['current',2003,2010,2016]) {
  const f=createSimulation(era,81), c=f.context, s=f.state;
  s.career=c.createFreshCareer(); s.position='SG'; s.careerTeam='LAL';
  s.attrs=Object.fromEntries(vm.runInContext('ATTR_KEYS',c).map(k=>[k,90]));
  Object.assign(s.attrs,{PAS:70,HAN:85,BLK:86});
  s.finalOVR=c.calcOVR(s.attrs); c.calcTrainingPoints=()=>3; c.renderTrainingCamp=()=>{};
  const before=JSON.stringify(s.attrs), initialOVR=s.finalOVR;
  assert.equal(c.getTrainingScoutSuggestions().join(','),'PAS,HAN,BLK');
  c.suggestTrainingFocus('PAS'); assert.equal(s._tpPending.PAS,2); assert.equal(c.getPendingTrainingCost(),2);
  assert.equal(JSON.stringify(s.attrs),before,'suggestions only prepare the existing training allocation');
  assert.match(c.renderTrainingScout(3),/70 → 72/);
  c.withdrawTrainingFocus('PAS'); assert.equal(c.getPendingTrainingCost(),0);
  c.suggestTrainingFocus('HAN'); assert.equal(s._tpPending.HAN,1); assert.equal(c.getPendingTrainingCost(),2);
  c.suggestTrainingFocus('HAN'); assert.equal(s._tpPending.HAN,1,'one remaining point cannot pay the two-point cost');
  c.withdrawTrainingFocus('HAN'); c.suggestTrainingFocus('BLK'); assert.equal(s._tpPending.BLK,1);
  c.resetTraining(); assert.equal(c.getPendingTrainingCost(),0);
  c.suggestTrainingFocus('PAS'); const expected=c.calcOVR({...s.attrs,PAS:72});
  c.saveCurrentSeasonToCareer=()=>{}; c.shouldOfferPlayerRetirement=()=>false; let continued=0;
  c.continueCareerAfterTraining=()=>continued++;
  const age=s.career.currentAge, contract=s.career.contract;
  c.confirmTraining(); c.confirmTraining();
  assert.equal(s.attrs.PAS,72); assert.equal(s.finalOVR,expected); assert.ok(s.finalOVR>=initialOVR);
  assert.equal(s.career.currentAge,age+1); assert.equal(s.career.contract,contract-1); assert.equal(continued,1);
  delete s._trainingConfirmed; s.attrs=Object.fromEntries(vm.runInContext('ATTR_KEYS',c).map(k=>[k,99]));
  assert.equal(c.getTrainingScoutSuggestions().length,0); assert.match(c.renderTrainingScout(3),/上限/);
  const rngBefore=vm.runInContext('JSON.stringify(_rngState)',c), stateBefore=JSON.stringify(s), rosterBefore=JSON.stringify(f.rosters);
  const story=c.getCareerTeamStory('LAL','首发'); assert.ok(story.length>50);
  assert.equal(JSON.stringify(s),stateBefore); assert.equal(JSON.stringify(f.rosters),rosterBefore);
  assert.equal(vm.runInContext('JSON.stringify(_rngState)',c),rngBefore,'story rendering never consumes randomness');
}

function market(focus, count=1, empty=false) {
  const f=createSimulation('current',92), c=f.context, s=f.state;
  c.HUPU_USER={nickname:'反馈测试',avatar:'',isLogin:false}; c.getHupuDisplayName=()=>c.HUPU_USER.nickname;
  s.career=c.createFreshCareer(); s.career.seasonCount=2; s.position='SG'; s.careerTeam='LAL'; s.finalOVR=90;
  s.attrs=Object.fromEntries(vm.runInContext('ATTR_KEYS',c).map(k=>[k,80]));
  f.rosters.LAL=Array.from({length:count},(_,i)=>({name:'Member '+i,cname:'Member '+i,pos:'SF',ovr:70,FIN:70,MID:70,threePT:70,HAN:70,PAS:70,IDEF:70,PDEF:70,REB:70,BLK:70,ATH:70,STR:70,CLU:70}));
  const base={...f.rosters.DEN[0],ovr:80,_origTeam:'DEN'};
  s._freeAgentPool=empty?[]:[{...base,name:'Guard',cname:'组织后卫',pos:'PG',PAS:92,HAN:91,threePT:62,IDEF:60,BLK:40},{...base,name:'Shooter',cname:'射手',pos:'SG',PAS:70,HAN:72,threePT:95,IDEF:60,BLK:40},{...base,name:'Rim',cname:'护筐手',pos:'C',PAS:65,HAN:50,threePT:30,IDEF:94,BLK:95}];
  s.career.rosterPriority={season:2,team:'LAL',focus,status:'queued'};
  return f;
}
for(const [focus,name] of [['organize','Guard'],['shooting','Shooter'],['protect','Rim']]) {
  const f=market(focus), c=f.context,s=f.state;
  c.assignFreeAgents();
  assert.equal(s.career.rosterPriority.player.nameEN,name,'the same market produces a different real signing for each focus');
  assert.equal(s._leagueChanges.freeSignings.filter(x=>x.priority).length,1);
  assert.ok(f.rosters.LAL.some(p=>p.name===name));
  const leagueNames=Object.values(f.rosters).flat().filter(p=>p.name===name); assert.equal(leagueNames.length,1);
  const result=c.simulate82StyleMatchup('LAL','BOS'); assert.ok(result.boxScore.LAL.some(p=>p.name===s.career.rosterPriority.player.name),'the signed player participates in the real box engine');
  const frozen=JSON.stringify(s.career.rosterPriority); c.assignFreeAgents(); assert.equal(JSON.stringify(s.career.rosterPriority),frozen);
  const snapshot=c.buildManualSaveSnapshot(); s.career=JSON.parse(JSON.stringify(snapshot.state.career));
  assert.equal(c.PP_MOD_V4.applyRosterPriority(),null,'saved processed requests cannot sign again');
}
for(const [count,empty,reason] of [[12,false,/名单已满/],[1,true,/没有.*符合/]]) {
  const f=market('protect',count,empty);f.context.assignFreeAgents();
  assert.match(f.state.career.rosterPriority.result,reason); assert.equal(f.state.career.rosterPriority.player,undefined);
}
{
  const f=market('organize');f.state._freeAgentPool.forEach(p=>p._origTeam='LAL');f.context.PP_MOD_V4.applyRosterPriority();
  assert.equal(f.state.career.rosterPriority.player,undefined,'existing no-return-to-origin rule is respected');
}
{
  const f=market('protect'),c=f.context,s=f.state; c.autoSaveGame=()=>Promise.resolve();
  let evolve=0, intelDone; c.evolveLeague=()=>evolve++;c.saveStandings=c.processDraft=c.processTrades=()=>{};
  c.showLeagueIntel=done=>{intelDone=done;};
  c.continueCareerAfterTraining(); assert.equal(evolve,1); assert.equal(s._offseasonMarketStage,'intel');
  c.continueCareerAfterTraining(); assert.equal(evolve,1,'resuming the offseason does not evolve or draft twice');
  const stale=intelDone; s.career=JSON.parse(JSON.stringify(s.career)); stale(); assert.equal(s._offseasonMarketStage,'intel');
}
{
  const f=market('balanced'),c=f.context,s=f.state,order=[];
  s.career.seasonCount=1; s._freeAgentPool=[]; c.autoSaveGame=()=>Promise.resolve();
  for(const [name,label] of [['evolveLeague','evolve'],['saveStandings','standings'],['processDraft','draft'],['processTrades','trades']])c[name]=()=>order.push(label);
  c.showLeagueIntel=done=>{order.push('intel');done();};
  c.showTeamSystemChooser=done=>{order.push('system');done();};
  const realAssign=c.assignFreeAgents;c.assignFreeAgents=()=>{order.push('assign');realAssign();};
  c.maybeMoveUserInOffseason=done=>{order.push('move');done();};c.finishOffseasonPipeline=()=>order.push('finish');
  c.continueCareerAfterTraining();
  assert.equal(order.join(','),'evolve,standings,draft,trades,intel,system,assign,move,finish');
  assert.equal(s._offseasonMarketStage,undefined);
}
console.log('career feedback: training, previews, confirmation, stories, market choices, real games, checkpoints passed');
