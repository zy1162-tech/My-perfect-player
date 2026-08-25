const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless:true, executablePath:fs.existsSync(installedChrome) ? installedChrome : undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(pathToFileURL(path.resolve(__dirname, '../nba-perfect-player.html')).href, { waitUntil:'load' });
  await page.waitForFunction(() => window.__PP_booted === true, { timeout:30000 });
  const shaqRetirement = await page.evaluate(() => {
    STATE.mode = 'legend';
    STATE.eraStart = 2003;
    STATE.career = { seasonCount:0, flags:{} };
    delete STATE._legendLeagueApplied;
    applyLegendEraLeague();
    const timeline = [];
    for (let season = 0; season <= 8; season++) {
      STATE.career.seasonCount = season;
      evolveLeague();
      if (typeof assignFreeAgents === 'function') assignFreeAgents();
      const shaq = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).find(player => player.name === "Shaquille O'Neal");
      const retiredShaq = (STATE._leagueChanges.retired || []).find(player => player.nameEN === "Shaquille O'Neal");
      timeline.push({ season:2003 + season, active:!!shaq, age:shaq && shaq._age, ovr:shaq && shaq.ovr, retiredAt:retiredShaq && retiredShaq.age });
      if (!shaq) break;
    }
    return timeline;
  });
  await page.reload({ waitUntil:'load' });
  await page.waitForFunction(() => window.__PP_booted === true, { timeout:30000 });
  const result = await page.evaluate(() => {
    STATE.mode = 'legend';
    STATE.eraStart = 2003;
    STATE.career = { seasonCount:0, flags:{} };
    delete STATE._legendLeagueApplied;
    applyLegendEraLeague();
    const all = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []);
    const amare = all.find(player => player.name === "Amar'e Stoudemire");
    const boozer = all.find(player => player.name === 'Carlos Boozer');
    const lebron = NBA2K_DATA.CLE.find(player => player.name === 'LeBron James');
    let paytons = all.filter(player => player.name === 'Gary Payton');
    const fresh = {
      count:all.length,
      minOvr:Math.min(...all.map(player => player.ovr)),
      amare:{ age:amare._age, ovr:amare.ovr, source:amare._sourceOvr },
      boozer:{ age:boozer._age, ovr:boozer.ovr, source:boozer._sourceOvr },
      lebron:{ inCle:!!lebron, age:lebron && lebron._age },
      payton:{ count:paytons.length, inLal:NBA2K_DATA.LAL.includes(paytons[0]), ovr:paytons[0] && paytons[0].ovr }
    };
    STATE.career.seasonCount = 9;
    boozer._age = 38;
    NBA2K_DATA.PHX.splice(NBA2K_DATA.PHX.indexOf(amare), 1);
    repairLegendEraPositions(2003);
    const repairedAmare = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).find(player => player.name === "Amar'e Stoudemire");
    const canonicalPayton = NBA2K_DATA.LAL.find(player => player.name === 'Gary Payton');
    NBA2K_DATA.CLE.push({ ...canonicalPayton, _eraF4SeasonAdjusted:false });
    repairLegendEraPositions(2003);
    paytons = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).filter(player => player.name === 'Gary Payton');
    const margins = [];
    for (let i = 0; i < 500; i++) {
      const game = simulate82StyleMatchup('GSW', 'LAL', { neutralState:true, includeBoxScore:false });
      margins.push(Math.abs(game.scoreA - game.scoreB));
    }
    const onePointRate = margins.filter(margin => margin === 1).length / margins.length;
    const closeGameRate = margins.filter(margin => margin <= 3).length / margins.length;
    STATE.careerTeam = 'GSW';
    STATE.teamSystems = { GSW:'seven_seconds' };
    showLeagueIntel(function() {});
    const intelOpened = !!document.getElementById('league-intel-modal');
    closeLeagueIntel();
    chooseTeamSystem('twin_towers');
    return {
      fresh,
      repaired:{ amareAge:repairedAmare && repairedAmare._age, amareRestored:!!(repairedAmare && repairedAmare._prematureRetirementRestored), boozerAge:boozer._age, paytonCount:paytons.length, paytonInLal:NBA2K_DATA.LAL.includes(paytons[0]) },
      scoreMargins:{ average:margins.reduce((sum, margin) => sum + margin, 0) / margins.length, onePointRate, closeGameRate },
      management:{ intelOpened, chosenSystem:STATE.teamSystems.GSW, effects:getTeamSystemEffects('GSW') },
      scripts:[...document.scripts].map(script => script.src).filter(src => /core|era-mode/.test(src))
    };
  });
  console.log(JSON.stringify({ result, shaqRetirement, errors }, null, 2));
  await browser.close();
  const shaqStayedThrough2009 = shaqRetirement.some(entry => entry.season === 2009 && entry.active && entry.ovr <= 86);
  const shaqRetiredBefore2011_12 = shaqRetirement.some(entry => entry.season === 2010 && !entry.active && entry.retiredAt === 38);
  if (errors.length || !shaqStayedThrough2009 || !shaqRetiredBefore2011_12 || result.fresh.count < 360 || result.fresh.count > 450 || result.fresh.minOvr !== 70 || result.fresh.amare.age !== 21 || result.fresh.boozer.age !== 22 || !result.fresh.lebron.inCle || result.fresh.lebron.age !== 19 || result.fresh.payton.count !== 1 || !result.fresh.payton.inLal || result.fresh.payton.ovr !== 87 || !result.repaired.amareRestored || result.repaired.amareAge !== 30 || result.repaired.boozerAge !== 31 || result.repaired.paytonCount !== 1 || !result.repaired.paytonInLal || result.scoreMargins.onePointRate >= 0.14 || result.scoreMargins.average <= 7 || !result.management.intelOpened || result.management.chosenSystem !== 'twin_towers' || result.management.effects.pace !== -3) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exit(1);
});
