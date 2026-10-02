const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

function samplePlayers(prefix) {
  return Array.from({ length:8 }, (_, index) => ({
    name:index === 0 ? prefix + '一位名字特别长的测试球员' : prefix + '球员' + (index + 1),
    pts:28 - index * 2,
    reb:4 + index,
    ast:9 - Math.floor(index / 2),
    stl:index % 4,
    blk:index % 3,
    tov:7,
    fgm:10,
    fga:18,
    isUser:index === 0
  }));
}

(async () => {
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    headless:true,
    executablePath:fs.existsSync(installedChrome) ? installedChrome : undefined
  });
  const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(pathToFileURL(path.resolve(__dirname, '../nba-perfect-player.html')).href, { waitUntil:'load' });
  await page.waitForFunction(() => window.__PP_booted === true, { timeout:30000 });
  await page.evaluate(async () => {
    if (window.PERFECT_PLAYER_DATA_READY) await window.PERFECT_PLAYER_DATA_READY;
  });
  await page.waitForTimeout(900);
  await page.evaluate(({ teamA, teamB }) => {
    initGame();
    showPlayoffGameDataPanel({
      game:4,
      myScore:112,
      oppScore:104,
      boxScore:{ GSW:teamA, LAL:teamB }
    }, 'GSW', 'LAL', '分区半决赛', function() {});
  }, { teamA:samplePlayers('勇士'), teamB:samplePlayers('湖人') });

  async function layout() {
    return page.evaluate(() => {
      const panel = document.getElementById('playoff-game-data-panel');
      const grid = panel.querySelector('.pp-game-box-grid');
      const cards = [...grid.querySelectorAll('section')];
      const header = cards[0].querySelector('.pp-game-box-head');
      const row = cards[0].querySelector('.pp-game-box-row');
      const positions = element => [...element.children].map(child => Math.round(child.getBoundingClientRect().left));
      return {
        viewport:window.innerWidth,
        panelOverflow:panel.scrollWidth - panel.clientWidth,
        gridOverflow:grid.scrollWidth - grid.clientWidth,
        cardTops:cards.map(card => Math.round(card.getBoundingClientRect().top)),
        labels:[...header.children].map(item => item.textContent.trim()),
        headerPositions:positions(header),
        rowPositions:positions(row),
        nameOverflow:row.querySelector('.pp-game-box-name').scrollWidth > row.querySelector('.pp-game-box-name').clientWidth
      };
    });
  }

  const desktop = await layout();
  assert.deepEqual(desktop.labels, ['球员','得分','篮板','助攻','抢断','盖帽']);
  assert.equal(desktop.panelOverflow <= 0, true, 'desktop panel must not overflow horizontally');
  assert.equal(desktop.gridOverflow <= 0, true, 'desktop team grid must not overflow horizontally');
  assert.equal(desktop.cardTops[0], desktop.cardTops[1], 'desktop team cards should be side by side');
  assert.deepEqual(desktop.headerPositions, desktop.rowPositions, 'desktop header and values must share column starts');
  assert.equal(desktop.nameOverflow, true, 'long names should ellipsize instead of widening the table');
  const desktopShot = path.join(os.tmpdir(), 'perfect-player-playoff-panel-desktop.png');
  await page.screenshot({ path:desktopShot, fullPage:false });

  await page.setViewportSize({ width:390, height:844 });
  const mobile = await layout();
  assert.equal(mobile.panelOverflow <= 0, true, 'mobile panel must not overflow horizontally');
  assert.equal(mobile.gridOverflow <= 0, true, 'mobile team grid must not overflow horizontally');
  assert.notEqual(mobile.cardTops[0], mobile.cardTops[1], 'mobile team cards should stack vertically');
  assert.deepEqual(mobile.headerPositions, mobile.rowPositions, 'mobile header and values must share column starts');
  const mobileShot = path.join(os.tmpdir(), 'perfect-player-playoff-panel-mobile.png');
  await page.screenshot({ path:mobileShot, fullPage:false });

  assert.deepEqual(pageErrors, [], `browser page errors are not allowed: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ passed:true, desktop, mobile, screenshots:[desktopShot,mobileShot] }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
