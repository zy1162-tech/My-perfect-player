import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

const read=file=>fs.readFileSync(new URL('../assets/js/'+file,import.meta.url),'utf8');
function fixture() {
  const f=createSimulation('current',81),c=f.context,s=f.state,modals=new Map();
  c.getHupuDisplayName=()=> 'Match Plan Test';c.HUPU_USER={nickname:'Match Plan Test',avatar:''};c.autoSaveGame=()=>{};
  s.careerTeam='LAL';s.position='SG';s.finalOVR=85;s.career=c.createFreshCareer();
  s.attrs=Object.fromEntries(['FIN','MID','threePT','DNK','HAN','PAS','PDEF','IDEF','REB','BLK','STL','ATH','STR','CLU','STA'].map(k=>[k,k==='STA'?0:85]));
  s.season={games:[],schedule:[],isPlayoffs:true,events:{injuryGamesLeft:0},playerStats:{games:0},playoffStats:{games:0}};
  c.document.getElementById=id=>modals.get(id)||null;
  c.document.body.insertAdjacentHTML=(_where,html)=>{const id=/id="([^"]+)"/.exec(html)[1];modals.set(id,{html,remove:()=>modals.delete(id),querySelector:()=>({focus(){}})});};
  for(const file of ['perfect-player-career-events.js','perfect-player-live-sim.js'])vm.runInContext(read(file),c,{filename:file});
  return {...f,modals,api:c.PP_CAREER_EVENTS};
}

{
  const f=fixture(),s=f.state;
  s.season.isPlayoffs=false;s.season.games=[{opponent:'BOS'}];s.season.pauseAfterNextGame=true;
  assert.equal(f.api.prepareGame('MIN',{},()=>{},()=>{}),true,'manual single-game advancement must offer simulate/watch even without an event');
  assert.match(f.modals.get('career-pregame-modal').html,/观看比赛/);
}

const results={};
for(const engine of ['direct','watched']) {
  results[engine]={};
  for(const id of ['balanced','rim','space','create']) {
    const f=fixture(),c=f.context,totals={threeA:0,threeM:0,fga:0,fta:0,ast:0,points:0};
    for(let game=0;game<40;game++) {
      vm.runInContext(`_rngState={s:${4000+game},c:0}`,c);
      const options={isPlayoff:true,title:'首轮 G'+(game+1),teamAHome:true};
      let pack;
      const dispatch=()=>{pack=engine==='direct'?c.skipUserGamePack('BOS',true,0,1,f.state.attrs,{teamAHome:true}):c.PP_LIVE.run('LAL','BOS',{isPlayoff:true,attrs:f.state.attrs,teamAHome:true});};
      assert.equal(f.api.prepareGame('BOS',options,dispatch,dispatch),true);
      c.selectCareerMatchPlan(id);
      assert.equal(f.api.getState().matchPlan.id,id);
      assert.equal(f.api.getMatchPlanModifiers('BOS').id,null,'a selected plan cannot affect the engine before tipoff');
      assert.doesNotMatch(f.modals.get('career-pregame-modal').html,/账户余额|合约工资|工资帽|虚拟形象/);
      c.runCareerPreparedGame(engine==='watched');
      assert.ok(pack && Number.isFinite(pack.result.scoreA));
      assert.equal(f.api.getMatchPlanModifiers('MIN').id,null,'the plan must not affect another opponent');
      for(const team of ['LAL','BOS'])assert.equal(pack.result.boxScore[team].reduce((n,p)=>n+p.pts,0),pack.result[team==='LAL'?'scoreA':'scoreB']);
      const key=f.api.matchKey('BOS',options);
      assert.equal(f.api.settleGame(key,pack.stats,pack.result,{isPlayoff:true}),true);
      const review=pack.result.careerMatchPlanReview;
      assert.equal(review.id,id);assert.equal(review.points,pack.stats.pts);assert.equal(review.teamScore,pack.result.scoreA);
      if(id!=='balanced')assert.equal(review.actual,pack.stats[id==='rim'?'fta':id==='space'?'threeA':'ast']);
      assert.equal(f.api.getState().matchPlan,null,'the plan must end with this match');
      assert.equal(f.api.settleGame(key,pack.stats,pack.result,{isPlayoff:true}),false,'repeated results cannot settle the plan twice');
      assert.equal(f.api.getMatchPlanModifiers('BOS').id,null);
      for(const k of ['threeA','threeM','fga','fta','ast'])totals[k]+=pack.stats[k];totals.points+=pack.stats.pts;
    }
    results[engine][id]=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Number((v/40).toFixed(3))]));
  }
  const r=results[engine];
  assert.ok(r.space.threeA>r.balanced.threeA*1.20,engine+': spacing must produce more actual three-point attempts');
  assert.ok(r.rim.fta>r.balanced.fta*1.10,engine+': rim pressure must produce more actual free throws');
  assert.ok(r.create.ast>r.balanced.ast*1.10,engine+': creation must produce more actual assists');
  assert.ok(r.create.fga<r.balanced.fga,engine+': creation must leave more shots to teammates');
}

{
  const f=fixture(),c=f.context,e=f.api.getState();
  e.matchPlan={id:'space',key:'fit',opponent:'BOS',status:'playing',goal:6};
  f.state.attrs.threePT=99;
  assert.ok(c.getCareerTeamGameModifiers('LAL','BOS').offense>0);
  f.state.attrs.threePT=40;
  assert.ok(c.getCareerTeamGameModifiers('LAL','BOS').offense<0,'choosing a weak skill must carry a real matchup cost');
  assert.equal(c.getCareerTeamGameModifiers('LAL','MIN').offense,0);
  e.matchPlan=null;
  for(let i=0;i<12;i++)f.api.settleGame('salary:'+i,{mins:20,pts:10},{won:true},{});
  const balance=e.money.cash,markup=c.renderCareerExperienceStrip(false);
  assert.equal((markup.match(/ce-contract-summary/g)||[]).length,1);
  assert.doesNotMatch(markup,/球队合约工资|工资帽|账本从第/);
  assert.equal(e.money.cash,balance,'condensing the ledger must not mutate money');
}

console.log(JSON.stringify(results,null,2));
console.log('Playoff plans passed: actual preparation/selection/dispatch, both production engines, matchup costs, box conservation, honest review, one-match expiry and condensed ledger.');
