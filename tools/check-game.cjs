// node tools/check-game.cjs [页面地址] [效果图目录]
// 使用已安装的 Playwright/Chrome；独立浏览器会话，不读取玩家的存档。
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

(async () => {
  const {createSimulation} = await import('./bench-era-baseline.mjs');
  for (const era of ['current',2003,2010,2016]) {
    const {context:c,state:s} = createSimulation(era,194);
    const result = c.simulate82StyleMatchup('LAL','BOS',{neutralState:true});
    assert.ok(result.scoreA>0 && result.scoreB>0 && result.scoreA!==result.scoreB);
    assert.equal(result.boxScore.LAL.reduce((n,p)=>n+p.pts,0),result.scoreA);
    assert.equal(result.boxScore.BOS.reduce((n,p)=>n+p.pts,0),result.scoreB);
    s.career = c.createFreshCareer();
    if (era === 'current') s.career.draft = {year:2025};
    assert.equal(c.getSeasonStartYear(2),(era === 'current' ? 2025 : era)+1);
    s.season={schedule:[{simulated:true}],isPlayoffs:true,playoffsDone:false};
    let advanced=false;
    c.applyAnnualAttributeDrift=c.renderTrainingCamp=()=>{advanced=true;};
    c.showManualSaveToast=()=>{};
    assert.equal(c.isSeasonFinished(),false);
    assert.equal(c.beginOffseason(),false);
    assert.equal(advanced,false,'季后赛未结束不得推进成长或训练');
  }
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  try {
    await page.goto(process.argv[2] || pathToFileURL(path.resolve(__dirname,'../nba-perfect-player.html')).href);
    await page.waitForFunction(()=>window.__PP_booted);
    await page.waitForSelector('#pp-boot',{state:'detached'});
    await page.evaluate(()=>window.__PP_ensure(['career','story']));
    await page.locator('.arena-player-model').evaluate(img=>img.decode());
    async function picture(name) {
      if (process.argv[3]) {
        await page.waitForSelector('#manual-save-toast',{state:'detached'});
        const output={path:path.join(process.argv[3],name+'.png'),animations:'disabled'};
        if(name==='game-pregame') await page.locator('#career-pregame-modal .ce-modal').screenshot(output);
        else await page.screenshot({...output,fullPage:true});
      }
    }
    async function fits() {
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'页面不能横向溢出');
    }
    await picture('game-lobby');
    for (const width of [390,320]) {await page.setViewportSize({width,height:844});await fits();}
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole('button',{name:'开始生涯 →',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.querySelector('.screen.active').id),'screen-character');

    async function setup(era='current') {
      await page.evaluate(era=>{
        initGame();STATE.mode=era==='current'?'current':'legend';STATE.eraStart=era==='current'?null:era;
        if(STATE.mode==='legend')applyLegendEraLeague();
        HUPU_USER.nickname='陈越';HUPU_USER.loaded=true;HUPU_USER.isLogin=false;
        STATE.position='SG';STATE.finalPosition='SG';STATE.careerTeam='LAL';STATE.career=createFreshCareer();
        STATE.career.currentAge=24;STATE.career.seasonCount=2;STATE.career.contract=3;
        ATTR_KEYS.forEach(k=>STATE.attrs[k]=85);STATE.attrs.STA=6;STATE.attrs.PAS=70;STATE.finalOVR=calcOVR(STATE.attrs);
        delete STATE._contractOfferOptions;delete STATE._offseasonMarketStage;delete STATE._seasonBranchEventId;
        delete STATE._offseasonQueue;delete STATE._tpPending;delete STATE._trainingConfirmed;
        PP_FX._suppressAchievementPopups=true;
        resetForNewSeason();STATE._careerSaved=false;STATE.season.simulationPaused=true;
      },era);
    }
    await setup();
    const restored=await page.evaluate(async()=>{
      showMyCard();const before=STATE.season.schedule.filter(g=>!g.simulated).length;
      await manualSaveGame(1);await manualLoadGame(1);
      return {screen:document.querySelector('.screen.active').id,before,after:STATE.season.schedule.filter(g=>!g.simulated).length,paused:STATE.season.simulationPaused};
    });
    assert.equal(restored.screen,'screen-mycard');assert.equal(restored.before,restored.after);assert.equal(restored.paused,true);
    await page.evaluate(()=>backToSeason());
    assert.equal(await page.evaluate(()=>document.querySelector('.screen.active').id),'screen-season');
    await page.evaluate(()=>{STATE.season.schedule.forEach(g=>g.simulated=true);STATE.season.isPlayoffs=true;STATE.season.playoffsDone=false;showMyCard();});
    assert.equal(await page.getByRole('button',{name:'进入休赛期',exact:false}).count(),0);

    const contracts=await page.evaluate(async()=>{
      STATE.career.contract=0;showContractOffers();const offers=JSON.stringify(STATE._contractOfferOptions);
      await manualSaveGame(1);await manualLoadGame(1);startNewSeason();startNewSeason();
      return {screen:document.querySelector('.screen.active').id,count:document.querySelectorAll('#contract-modal').length,
        contract:STATE.career.contract,offersUnchanged:offers===JSON.stringify(STATE._contractOfferOptions),games:STATE.season.games.length};
    });
    assert.equal(contracts.screen,'screen-roster-review');assert.equal(contracts.count,1);
    assert.equal(contracts.contract,0);assert.equal(contracts.games,0);assert.equal(contracts.offersUnchanged,true);
    const signing=await page.evaluate(()=>{
      const offer=STATE._contractOfferOptions.offers[0];if(!offer)throw new Error('没有签约测试对象');
      selectContractOption(offer.team,offer.years);const first=STATE.career.contract;
      selectContractOption(offer.team,5);return {first,second:STATE.career.contract};
    });
    assert.ok(signing.first>0);assert.equal(signing.first,signing.second);
    const teamChange = page.locator('#fa-team-change-modal');
    if(await teamChange.count()) await teamChange.getByRole('button').last().click();
    const rosterReport = page.locator('#offseason-team-report');
    if(await rosterReport.count()) await rosterReport.getByRole('button').last().click();

    await setup();
    const random=await page.evaluate(()=>{
      simulate82StyleMatchup('LAL','BOS',{neutralState:true});
      function match(){clearLineupCache();const r=simulate82StyleMatchup('LAL','BOS',{neutralState:true});return [r.scoreA,r.scoreB];}
      _rngState={s:194,c:0};const before=match();_rngState={s:194,c:0};
      PP_FX.tapSpark(300,200);const calls=_rngState.c;const after=match();
      return {before,after,calls};
    });
    assert.equal(random.calls,0);assert.deepEqual(random.before,random.after);
    const years=await page.evaluate(()=>{
      STATE.career.draft={year:2025};STATE.career.seasonCount=1;
      const t=PP_SEASON_REPORT._test.buildHonorTimeline(STATE);
      return {label:getCurrentSeasonLabel(),timeline:t.end,economy:getCareerEconomicYear()};
    });
    assert.equal(years.label,'2026-27赛季');assert.equal(years.timeline,2026);assert.equal(years.economy,2026);

    for(const era of ['current',2003,2010,2016]) {
      await setup(era);await page.evaluate(()=>renderTrainingCamp());
      const points=await page.evaluate(()=>calcTrainingPoints());
      await page.locator('.training-scout-row').filter({hasText:'传球'}).getByRole('button',{name:'重点训练'}).click();
      assert.equal(await page.evaluate(()=>getPendingTrainingCost()),Math.min(2,points));
      await page.locator('.training-scout-row').filter({hasText:'传球'}).getByRole('button',{name:'撤回'}).click();
      assert.equal(await page.evaluate(()=>getPendingTrainingCost()),0);
      await fits();
      if(era==='current') await picture('game-training');
      for(const width of [390,320]) {await page.setViewportSize({width,height:844});await fits();}
      await page.setViewportSize({width:1440,height:900});
    }
    await setup();
    await page.evaluate(()=>{showScreen('screen-season');renderSeasonScreenDOM();STATE.season.simulationPaused=false;STATE.season.pauseAfterNextGame=true;quickSimAllGames();});
    await page.waitForSelector('#career-pregame-modal');
    await picture('game-pregame');
    await page.getByRole('button',{name:'模拟本场',exact:true}).click();
    await page.waitForFunction(()=>STATE.season.games.length===1);
    assert.equal(await page.evaluate(()=>STATE.season.schedule.filter(g=>g.simulated).length),1);
    assert.equal(await page.evaluate(()=>STATE.season.simulationPaused),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,eras:4,save:restored,contracts,random,years,pageErrors:errors}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
