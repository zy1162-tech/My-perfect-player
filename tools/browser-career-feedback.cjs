const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1305,height:884}}), errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname,'../nba-perfect-player.html')).href);
    await page.waitForFunction(()=>window.__PP_booted===true);
    await page.evaluate(()=>window.__PP_ensure(['career','story']));
    await page.evaluate(()=>{PP_FX._suppressAchievementPopups=true;});
    const records=[];
    for(const era of ['current',2003,2010,2016]) {
      await page.evaluate(era=>{
        initGame(); STATE.mode=era==='current'?'current':'legend'; STATE.eraStart=era==='current'?null:era;
        if(STATE.mode==='legend')applyLegendEraLeague();
        HUPU_USER.nickname='生涯反馈测试'; HUPU_USER.loaded=true;HUPU_USER.isLogin=false;
        STATE.position='SG';STATE.careerTeam='LAL';STATE.career.currentAge=23;STATE.career.seasonCount=2;STATE.career.contract=3;
        ATTR_KEYS.forEach(k=>STATE.attrs[k]=90);Object.assign(STATE.attrs,{PAS:70,HAN:85,BLK:86});STATE.finalOVR=calcOVR(STATE.attrs);
        STATE._careerSaved=true;renderTrainingCamp();
      },era);
      const before=await page.evaluate(()=>({points:calcTrainingPoints(),attrs:JSON.stringify(STATE.attrs),ovr:STATE.finalOVR}));
      await page.locator('.training-scout-row').filter({hasText:'传球'}).getByRole('button',{name:'重点训练'}).click();
      assert.equal(await page.evaluate(()=>STATE._tpPending.PAS),Math.min(2,before.points));
      assert.equal(await page.evaluate(()=>JSON.stringify(STATE.attrs)),before.attrs);
      await page.locator('.training-scout-row').filter({hasText:'传球'}).getByRole('button',{name:'撤回'}).click();
      assert.equal(await page.evaluate(()=>getPendingTrainingCost()),0);
      await page.locator('.training-scout-row').filter({hasText:'传球'}).getByRole('button',{name:'重点训练'}).click();
      if(era==='current')await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-training.png')});
      const result=await page.evaluate(()=>{
        const req={season:2,team:'LAL',focus:'balanced',status:'choosing'};STATE.career.rosterPriority=req;
        STATE.career.profile.leadership=12;
        PP_MOD_V4.showRosterAuthority(()=>{});
        return {story:getCareerTeamStory('LAL','首发'),preview:document.querySelector('.training-scout-heading').textContent};
      });
      await page.getByRole('radio',{name:'内线护筐'}).check();
      assert.equal(await page.evaluate(()=>STATE.career.rosterPriority.focus),'protect');
      await page.evaluate(()=>manualSaveGame(1));
      await page.evaluate(()=>{STATE.career.rosterPriority.focus='shooting';return manualLoadGame(1);});
      assert.equal(await page.evaluate(()=>STATE.career.rosterPriority.focus),'protect');
      await page.evaluate(()=>document.getElementById('roster-authority-modal')?.remove());
      records.push({era,...result});
    }
    const market=await page.evaluate(()=>{
      const team=STATE.careerTeam;
      PP_SEASON_REPORT.captureOffseasonRosterSnapshot();
      NBA2K_DATA[team]=NBA2K_DATA[team].filter(p=>!canPlayPosition(p.pos||'','C')&&!canPlayPosition(p.pos||'','PF'));
      const source=NBA2K_TEAMS.find(t=>t!==team && NBA2K_DATA[t].some(p=>p.ovr<=82 && canPlayPosition(p.pos||'','C')));
      const player=NBA2K_DATA[source].find(p=>p.ovr<=82 && canPlayPosition(p.pos||'','C'));
      NBA2K_DATA[source].splice(NBA2K_DATA[source].indexOf(player),1);player._origTeam=source;
      STATE._freeAgentPool=[player];STATE._leagueChanges={};STATE.career.rosterPriority.status='queued';
      assignFreeAgents();clearLineupCache();
      const result=simulate82StyleMatchup(team,source);
      PP_SEASON_REPORT.finalizeOffseasonRosterReport();PP_SEASON_REPORT.showOffseasonTeamReport(()=>{});
      return {name:player.cname||player.name,contract:player.contract,played:result.boxScore[team].some(p=>p.name===(player.cname||player.name)),request:STATE.career.rosterPriority};
    });
    assert.equal(market.played,true);assert.ok(market.contract>0);assert.match(market.request.result,/签下/);
    assert.match(await page.locator('.roster-priority-result').textContent(),new RegExp(market.name));
    await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-market.png')});
    await page.locator('#offseason-report-continue').click();
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>renderTrainingCamp());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-mobile.png')});
    await page.setViewportSize({width:1305,height:884});
    const birth=await page.evaluate(()=>{
      initGame();STATE.mode='current';STATE.position='SG';STATE.lockedCount=13;
      ATTR_KEYS.forEach(k=>STATE.attrs[k]=85);
      PP_FX._suppressAchievementPopups=true;PP_FX.respecLegacy();PP_FX.buyPerk('scorer');PP_FX.buyPerk('floor_general');
      revealPlayer();STATE.careerTeam='LAL';showScreen('screen-training');renderTrainingCamp();
      const result={attrs:JSON.stringify(STATE.attrs),effects:JSON.stringify(PP_FX.getLegacySimulationEffects()),snapshot:JSON.stringify(STATE.career.legacySnapshot)};
      PP_FX.openLegacyPanel();return result;
    });
    assert.equal(JSON.parse(birth.attrs).threePT,86);
    await page.locator('[data-perk="scorer"]').click();await page.locator('[data-perk="floor_general"]').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(STATE.attrs)),birth.attrs);
    assert.equal(await page.evaluate(()=>JSON.stringify(PP_FX.getLegacySimulationEffects())),birth.effects);
    assert.match(await page.locator('.pp-lg-grid').textContent(),/本次：三分 \+1/);
    assert.match(await page.locator('.pp-lg-grid').textContent(),/下次：三分 \+2/);
    await page.waitForTimeout(4000);
    await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-legacy.png')});
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.evaluate(()=>manualSaveGame(1));await page.evaluate(()=>manualLoadGame(1));
    assert.equal(await page.evaluate(()=>JSON.stringify(STATE.career.legacySnapshot)),birth.snapshot);
    assert.equal(await page.evaluate(()=>JSON.stringify(PP_FX.getLegacySimulationEffects())),birth.effects);
    const history=await page.evaluate(()=>{
      initGame();STATE.mode='legend';STATE.eraStart=2010;STATE.careerTeam='LAL';STATE.position='SG';STATE.finalOVR=86;applyLegendEraLeague();
      STATE.season.awards=[{act:'mvp',winner:'德里克-罗斯',winnerEN:'Derrick Rose',isUser:false}];
      STATE.season.finalsMvp={name:'德克-诺维茨基',nameEN:'Dirk Nowitzki',isUser:false};
      STATE.season.leagueFinale={complete:true,champion:'DAL',championName:'独行侠',finalsMvp:STATE.season.finalsMvp,finalsSeriesSummary:'独行侠 4–2 热火'};
      STATE.season.standings={};NBA2K_TEAMS.forEach(t=>{STATE.season.standings[t]={wins:t==='LAL'?0:50,losses:t==='LAL'?82:32};});
      ATTR_KEYS.forEach(k=>STATE.attrs[k]=85);showScreen('screen-season');showEndOfSeason();
      return {model:PP_SEASON_REPORT._test.buildHonorTimeline(STATE)};
    });
    assert.equal(history.model.rows.find(x=>x.key==='kobebryant').game.fmvp,2);
    assert.equal(history.model.rows.find(x=>x.key==='derrickrose').game.mvp,1);
    await page.getByRole('button',{name:/查看赛季总结/}).click();
    await page.locator('.honor-history summary').click();
    await page.waitForTimeout(4000);
    await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-history.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-history-mobile.png')});
    const archival=await page.evaluate(()=>{saveCurrentSeasonToCareer();saveCurrentSeasonToCareer();return {records:Object.keys(STATE.career.leagueHonors).length,seasons:STATE.career.seasonCount};});
    assert.equal(archival.records,1);assert.equal(archival.seasons,1);
    await page.evaluate(()=>manualSaveGame(1));await page.evaluate(()=>manualLoadGame(1));
    assert.equal(await page.evaluate(()=>Object.keys(STATE.career.leagueHonors).length),1);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,records,market:'real player signed, contract and box score, visible outcome report',legacy:'birth, actual purchase buttons, current/next effects and save restoration',history:'actual season archival, baselines, de-duplication, folded season-summary UI and restoration',mobile:'no horizontal overflow',errors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
