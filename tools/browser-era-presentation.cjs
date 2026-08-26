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
    { label:'2003', mode:'legend', era:2003 },
    { label:'2010', mode:'legend', era:2010 },
    { label:'2016', mode:'legend', era:2016 }
  ];
  const results = [];
  for (const testCase of cases) {
    const result = await page.evaluate(({ mode, era }) => {
      initGame();
      STATE.mode = mode;
      if (era) {
        STATE.eraStart = era;
        STATE.draftMode = 'historical';
        PP_ERA_MODE.apply(era);
      }
      const players = [];
      NBA2K_TEAMS.forEach(team => (NBA2K_DATA[team] || []).forEach(player => {
        if (!player || player._isUser) return;
        players.push(player);
      }));
      const badChinese = players.filter(player => !/[\u3400-\u9fff]/.test(String(player.cname || '')))
        .map(player => player.nameEN || player.name);
      const styles = players.map(player => getPlayerHeadshotStyle(player, 56));
      return {
        teams:NBA2K_TEAMS.filter(team => (NBA2K_DATA[team] || []).length).length,
        players:players.length,
        badChinese:badChinese,
        emptyStyles:styles.filter(style => !style).length,
        missingInitialFallback:styles.filter(style => !style.includes('data:image/svg+xml')).length,
        selected:players.filter(player => player.photoSource === 'selected-era-headshot' && /^assets\/images\/Player\/hupu-era\//.test(String(player.photoLocal || ''))).length
      };
    }, testCase);
    assert.equal(result.teams, 30, `${testCase.label}: all teams must retain a non-empty roster`);
    assert.ok(result.players > 400, `${testCase.label}: runtime roster audit must cover the complete league`);
    assert.deepEqual(result.badChinese, [], `${testCase.label}: every real runtime player must display Chinese`);
    assert.equal(result.emptyStyles, 0, `${testCase.label}: no player may render an empty avatar style`);
    assert.equal(result.missingInitialFallback, 0, `${testCase.label}: every avatar chain needs a deterministic initials fallback`);
    if (testCase.era) assert.ok(result.selected > 0, `${testCase.label}: selected local era photos must be wired into the runtime roster`);
    results.push({ mode:testCase.label, players:result.players, selected:result.selected });
  }

  const currentFixes = await page.evaluate(() => {
    initGame();
    const wanted = ['Trey Lyles','Adam Flagler','Mo Bamba','Tamar Bates'];
    const all = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []);
    const identities = {};
    wanted.forEach(name => {
      const player = all.find(item => item && (item.nameEN === name || item.name === name));
      identities[name] = player && { name:player.name, nameEN:player.nameEN };
      if (player) player.cname = name; // 模拟旧 current 存档的 snap.league 覆盖结果
    });
    applyCurrentPlayerChineseDisplayFixes();
    return {
      cn:Object.fromEntries(wanted.map(name => {
      const player = all.find(item => item && (item.nameEN === name || item.name === name));
      return [name, player && player.cname || ''];
      })),
      identityStable:wanted.every(name => {
        const player = all.find(item => item && (item.nameEN === name || item.name === name));
        return player && player.name === identities[name].name && player.nameEN === identities[name].nameEN;
      })
    };
  });
  assert.deepEqual(currentFixes.cn, {
    'Trey Lyles':'特雷-莱尔斯',
    'Adam Flagler':'亚当-弗拉格勒',
    'Mo Bamba':'穆罕默德-班巴',
    'Tamar Bates':'塔马尔-贝茨'
  });
  assert.equal(currentFixes.identityStable, true, 'repeatable current-name fixes must not change save identity keys');

  const suffixIsolation = await page.evaluate(() => {
    initGame();
    STATE.mode = 'legend';
    STATE.eraStart = 2003;
    STATE.draftMode = 'historical';
    PP_ERA_MODE.apply(2003);
    const father = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).find(player => player && player.nameEN === 'Glenn Robinson');
    initGame();
    STATE.mode = 'legend';
    STATE.eraStart = 2016;
    STATE.draftMode = 'historical';
    PP_ERA_MODE.apply(2016);
    // 生产名单修正可能因 15 人上限裁掉低 OVR 的儿子；用旧档同形状行直测懒修复入口。
    const son = { name:'Glenn Robinson III', nameEN:'Glenn Robinson III', cname:'格伦-罗宾逊三世', pos:'SF', ovr:67, _age:22, _eraRoster:true };
    NBA2K_DATA.IND.push(son);
    repairLegendEraPositions(2016);
    return {
      fatherPhoto:father && /\/glennrobinson\.jpg$/.test(String(father.photoLocal || '')),
      sonExists:!!son,
      sonDidNotInheritFather:!!son && !/\/glennrobinson\.jpg$/.test(String(son.photoLocal || '')),
      sonUsesFallback:!!son && getPlayerHeadshotStyle(son, 56).includes('data:image/svg+xml')
    };
  });
  assert.deepEqual(suffixIsolation, {
    fatherPhoto:true,
    sonExists:true,
    sonDidNotInheritFather:true,
    sonUsesFallback:true
  });

  const compatibility = await page.evaluate(() => {
    initGame();
    STATE.mode = 'legend';
    STATE.eraStart = 2003;
    STATE.draftMode = 'historical';
    PP_ERA_MODE.apply(2003);
    const player = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || [])
      .find(item => item && item.photoSource === 'selected-era-headshot');
    const beforeName = player.name;
    const beforeNameEN = player.nameEN;
    player.cname = player.nameEN;
    player.photoLocal = '';
    player.photoUrl = '';
    player.nbaId = 0;
    repairLegendEraPositions(2003);
    const rookie = PP_ERA_MODE.generateRookie('ATL', 2023);
    const rookieStyleA = getPlayerHeadshotStyle(rookie, 56);
    const rookieStyleB = getPlayerHeadshotStyle(rookie, 56);
    return {
      sameIdentity:player.name === beforeName && player.nameEN === beforeNameEN,
      restoredChinese:/[\u3400-\u9fff]/.test(String(player.cname || '')),
      restoredPhoto:/^assets\/images\/Player\/hupu-era\//.test(String(player.photoLocal || '')),
      generated:rookie._eraGenerated === true,
      rookieNoRealPhoto:!rookie.photoLocal && !rookie.photoUrl && !rookie.nbaId,
      rookieUsesInitials:rookieStyleA.includes('data:image/svg+xml'),
      stableFallback:rookieStyleA === rookieStyleB
    };
  });
  assert.deepEqual(compatibility, {
    sameIdentity:true,
    restoredChinese:true,
    restoredPhoto:true,
    generated:true,
    rookieNoRealPhoto:true,
    rookieUsesInitials:true,
    stableFallback:true
  });

  const imageLoads = await page.evaluate(async () => {
    const paths = Object.values(window.__PP_ERA_PRESENTATION__.players)
      .map(value => value.p).filter(value => /^assets\/images\/Player\/hupu-era\//.test(value)).slice(0, 8);
    return Promise.all(paths.map(src => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve({ src, ok:image.naturalWidth > 0 && image.naturalHeight > 0 });
      image.onerror = () => resolve({ src, ok:false });
      image.src = src;
    })));
  });
  assert.ok(imageLoads.every(item => item.ok), `sample selected images must decode in the browser: ${JSON.stringify(imageLoads)}`);
  assert.deepEqual(pageErrors, [], `browser page errors are not allowed: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ passed:true, results, currentOldSaveFix:currentFixes, suffixIsolation, compatibility, imageLoads:imageLoads.length }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
