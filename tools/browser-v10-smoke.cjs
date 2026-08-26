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
  const result = await page.evaluate(() => {
    STATE.mode = 'legend';
    STATE.eraStart = 2003;
    STATE.career = { seasonCount:0, flags:{} };
    delete STATE._legendLeagueApplied;
    applyLegendEraLeague();
    const all = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []);
    const amare = all.find(player => player.name === "Amar'e Stoudemire");
    const boozer = all.find(player => player.name === 'Carlos Boozer');
    const fresh = {
      count:all.length,
      minOvr:Math.min(...all.map(player => player.ovr)),
      amare:{ age:amare._age, ovr:amare.ovr, source:amare._sourceOvr },
      boozer:{ age:boozer._age, ovr:boozer.ovr, source:boozer._sourceOvr }
    };
    STATE.career.seasonCount = 9;
    boozer._age = 38;
    NBA2K_DATA.PHX.splice(NBA2K_DATA.PHX.indexOf(amare), 1);
    repairLegendEraPositions(2003);
    const repairedAmare = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).find(player => player.name === "Amar'e Stoudemire");
    return {
      fresh,
      repaired:{ amareAge:repairedAmare && repairedAmare._age, amareRestored:!!(repairedAmare && repairedAmare._prematureRetirementRestored), boozerAge:boozer._age },
      scripts:[...document.scripts].map(script => script.src).filter(src => /core|era-mode/.test(src))
    };
  });
  console.log(JSON.stringify({ result, errors }, null, 2));
  await browser.close();
  if (errors.length || result.fresh.count !== 450 || result.fresh.minOvr !== 70 || result.fresh.amare.age !== 20 || result.fresh.boozer.age !== 21 || !result.repaired.amareRestored || result.repaired.amareAge !== 29 || result.repaired.boozerAge !== 30) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exit(1);
});
