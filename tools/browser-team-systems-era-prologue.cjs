const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless:true, executablePath:fs.existsSync(installedChrome) ? installedChrome : undefined });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(pathToFileURL(path.resolve(__dirname, '../nba-perfect-player.html')).href, { waitUntil:'load' });
  await page.waitForFunction(() => window.__PP_booted === true, { timeout:30000 });
  await page.evaluate(() => window.__PP_ensure('story'));

  const result = await page.evaluate(() => {
    function newCareerReset(mode, era) {
      STATE.careerTeam = 'PHX';
      STATE.teamSystems = { PHX:'five_out', BOS:'defense_transition' };
      initGame();
      STATE.mode = mode;
      if (era) STATE.eraStart = era;
      return {
        keys:Object.keys(STATE.teamSystems || {}),
        phx:getTeamSystemEffects('PHX'),
        bos:getTeamSystemEffects('BOS')
      };
    }
    const newCareerResets = {
      current:newCareerReset('current'),
      legend:newCareerReset('legend', 2003)
    };
    const prologues = {};
    [2003, 2010, 2016].forEach(era => {
      initGame();
      STATE.mode = 'legend';
      STATE.eraStart = era;
      STATE.career = { seasonCount:0, seasons:[] };
      STATE.season = { games:[] };
      const first = PP_ERA_STORY.showPrologueIfDue();
      const modal = document.getElementById('season-branch-modal');
      prologues[era] = {
        first,
        title:modal && modal.querySelector('.team-picker-header') && modal.querySelector('.team-picker-header').textContent,
        sameModal:!!(modal && modal.classList.contains('team-picker-overlay')),
        second:PP_ERA_STORY.showPrologueIfDue(),
        status:PP_ERA_STORY.getPrologueStatus()
      };
      if (modal) modal.remove();
    });
    initGame();
    STATE.mode = 'legend'; STATE.eraStart = 2010;
    STATE.career = { seasonCount:2, seasons:[{}] }; STATE.season = { games:[{}] };
    const oldSave = { shown:PP_ERA_STORY.showPrologueIfDue({ existingSave:true }), status:PP_ERA_STORY.getPrologueStatus() };
    initGame();
    STATE.mode = 'current'; STATE.career = { seasonCount:0, seasons:[] };
    const currentShown = PP_ERA_STORY.showPrologueIfDue();

    STATE.careerTeam = 'PHX';
    function sampleSystem(key) {
      STATE.teamSystems = { PHX:key, BOS:'balanced' };
      let seed = 0x5eed1234;
      const originalRandom = Math.random;
      Math.random = function() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      let points = 0, pace = 0;
      for (let i = 0; i < 800; i++) {
        const game = simulate82StyleMatchup('PHX', 'BOS', { neutralState:true, teamAHome:false, includeBoxScore:false });
        points += game.scoreA; pace += game.pace;
      }
      Math.random = originalRandom;
      return { points:points / 800, pace:pace / 800 };
    }
    const simulation = { balanced:sampleSystem('balanced'), fiveOut:sampleSystem('five_out') };
    showTeamSystemChooser();
    const chooser = document.getElementById('team-system-modal');
    const optionCount = chooser ? chooser.querySelectorAll('button').length : 0;
    chooseTeamSystem('five_out');
    return {
      newCareerResets,
      prologues,
      oldSave,
      currentShown,
      system:{ optionCount, selected:STATE.teamSystems.PHX, effects:getTeamSystemEffects('PHX'), chooserClosed:!document.getElementById('team-system-modal'), simulation }
    };
  });

  for (const [mode, reset] of Object.entries(result.newCareerResets)) {
    assert.deepEqual(reset.keys, [], `${mode}: a new career must not inherit any previous team-system key`);
    assert.equal(reset.phx.name, '均衡体系');
    assert.equal(reset.bos.name, '均衡体系');
  }
  for (const era of [2003, 2010, 2016]) {
    const row = result.prologues[era];
    assert.equal(row.first, true);
    assert.match(row.title, new RegExp(String(era)));
    assert.equal(row.sameModal, true, 'prologue must reuse the existing season branch modal');
    assert.equal(row.second, false, 'automatic prologue is one-shot');
    assert.equal(row.status.seen, true);
  }
  assert.equal(result.oldSave.shown, false);
  assert.equal(result.oldSave.status.legacySkipped, true);
  assert.equal(result.currentShown, false);
  assert.equal(result.system.optionCount, 5);
  assert.equal(result.system.selected, 'five_out');
  assert.equal(result.system.effects.three, 0.016);
  assert.equal(result.system.chooserClosed, true);
  assert.ok(result.system.simulation.fiveOut.points > result.system.simulation.balanced.points + 1.5, 'five-out production wiring should measurably raise scoring across a long fixed-seed sample');
  assert.ok(result.system.simulation.fiveOut.pace > result.system.simulation.balanced.pace + 0.25, 'five-out pace modifier should reach production match simulation');
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ passed:true, result }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
