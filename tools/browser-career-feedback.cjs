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
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>renderTrainingCamp());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.resolve(__dirname,'artifacts/career-feedback-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,records,mobile:'no horizontal overflow',errors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
