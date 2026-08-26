const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    headless:true,
    executablePath:fs.existsSync(installedChrome) ? installedChrome : undefined
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto(pathToFileURL(path.resolve(__dirname, '../nba-perfect-player.html')).href, { waitUntil:'load' });
  await page.waitForFunction(() => window.__PP_booted === true, { timeout:30000 });
  await page.evaluate(async () => {
    if (window.PERFECT_PLAYER_DATA_READY) await window.PERFECT_PLAYER_DATA_READY;
  });

  const cases = [
    { label:'current', mode:'current', era:null },
    { label:'legend-2003', mode:'legend', era:2003 },
    { label:'legend-2010', mode:'legend', era:2010 },
    { label:'legend-2016', mode:'legend', era:2016 }
  ];
  const results = [];

  for (const testCase of cases) {
    const before = await page.evaluate(({ mode, era }) => {
      initGame();
      STATE.mode = mode;
      if (era) {
        STATE.eraStart = era;
        STATE.draftMode = 'historical';
      }
      beginAttributeBuild();
      return {
        teams:getBuildSpinTeams().length,
        reelItems:document.querySelectorAll('#slot-reel .br-slot-item').length,
        historicalActive:isHistoricalBuildActive(),
        applied:STATE._legendLeagueApplied || null
      };
    }, testCase);

    assert.equal(before.teams, 30, `${testCase.label}: build spinner should expose 30 usable teams`);
    assert.equal(before.reelItems, 150, `${testCase.label}: five reel copies should render 150 items`);
    if (testCase.mode === 'current') {
      assert.equal(before.historicalActive, false, 'current mode must not activate a historical roster');
    } else {
      assert.equal(before.historicalActive, true, `${testCase.label}: historical roster should be active before spinning`);
      assert.equal(before.applied, testCase.era, `${testCase.label}: selected era should be applied before spinning`);
    }

    await page.evaluate(() => spinSlotMachine());
    await page.waitForFunction(() => !!STATE.currentTeam && Array.isArray(STATE._drawPlayers) && STATE._drawPlayers.length === 5, { timeout:6000 });
    const after = await page.evaluate(() => ({
      currentTeam:STATE.currentTeam,
      cards:STATE._drawPlayers.length,
      teams:getBuildSpinTeams().length,
      highlighted:document.querySelectorAll('#slot-reel .highlight').length
    }));
    assert.ok(after.currentTeam, `${testCase.label}: spin must select a team`);
    assert.equal(after.cards, 5, `${testCase.label}: selected team must render five candidates`);
    assert.equal(after.teams, 30, `${testCase.label}: team source must remain stable after spinning`);
    results.push({ mode:testCase.label, ...before, currentTeam:after.currentTeam, cards:after.cards });
  }

  assert.deepEqual(pageErrors, [], `browser page errors are not allowed: ${pageErrors.join(' | ')}`);
  const eraScript = await page.evaluate(() => [...document.scripts].map(script => script.src).find(src => /perfect-player-era-mode/.test(src)) || '');
  assert.match(eraScript, /perfect-player-era-mode\.js\?v=20260826-era-headshots-v29$/);
  console.log(JSON.stringify({ passed:true, results, pageErrors }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
