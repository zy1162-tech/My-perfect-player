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

  const renderAudit = await page.evaluate(async () => {
    function enter(mode, era) {
      initGame();
      STATE.mode = mode;
      if (era) { STATE.eraStart = era; STATE.draftMode = 'historical'; }
      beginAttributeBuild();
    }
    function seededFive(pool, seed) {
      const out = [];
      let state = seed >>> 0;
      while (out.length < Math.min(5, pool.length)) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const player = pool[state % pool.length];
        if (player && !out.includes(player)) out.push(player);
      }
      return out;
    }
    function inspectRendered(shown) {
      const elements = [...document.querySelectorAll('#br-roster-area .bp-headshot')];
      return elements.map((element, index) => {
        const style = element.getAttribute('style') || '';
        const sources = getPlayerHeadshotSources(shown[index]);
        return {
          name:shown[index] && (shown[index].nameEN || shown[index].name),
          intact:/background-image:url\('[^']+'\)/.test(style) && style.includes('background-position:') && style.includes('height:32px'),
          computed:getComputedStyle(element).backgroundImage,
          local:sources.local[0] || '',
          fallback:sources.fallback
        };
      });
    }
    async function decode(paths) {
      const unique = [...new Set(paths.filter(Boolean))];
      return Promise.all(unique.map(src => new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve({ src, ok:image.naturalWidth > 0 && image.naturalHeight > 0 });
        image.onerror = () => resolve({ src, ok:false });
        image.src = src;
      })));
    }
    const modes = [{ label:'current', mode:'current' }, { label:'2003', mode:'legend', era:2003 }, { label:'2010', mode:'legend', era:2010 }, { label:'2016', mode:'legend', era:2016 }];
    const modeResults = [];
    const allLocalPaths = [];
    for (const item of modes) {
      enter(item.mode, item.era);
      const teams = getBuildSpinTeams();
      const rows = [];
      teams.forEach((team, index) => {
        const pool = getBuildPlayerPool(team);
        const shown = seededFive(pool, (item.era || 2026) * 131 + index * 17);
        renderRosterPlayers(team, shown, pool);
        rows.push(...inspectRendered(shown));
      });
      allLocalPaths.push(...rows.map(row => row.local));
      modeResults.push({ label:item.label, teams:teams.length, cards:rows.length, broken:rows.filter(row => !row.intact || !row.computed || row.computed === 'none').map(row => row.name) });
    }
    enter('legend', 2003);
    const indPool = getBuildPlayerPool('IND');
    const fixedNames = ['Reggie Miller','Fred Jones','Primož Brezec','Jamaal Tinsley','Jamison Brewer'];
    const fixed = fixedNames.map(name => indPool.find(player => (player.nameEN || player.name) === name));
    if (fixed.some(player => !player)) throw new Error('2003 IND screenshot fixtures missing: ' + fixedNames.filter((name, index) => !fixed[index]).join(', ') + '; active=' + indPool.map(player => (player.nameEN || player.name) + ':' + player.ovr).join('|'));
    renderRosterPlayers('IND', fixed, indPool);
    const fixedRows = inspectRendered(fixed);
    allLocalPaths.push(...fixedRows.map(row => row.local));
    const decoded = await decode(allLocalPaths);
    return { modeResults, fixedRows, decodedFailures:decoded.filter(item => !item.ok), decodedCount:decoded.length };
  });
  for (const result of renderAudit.modeResults) {
    assert.equal(result.teams, 30, `${result.label}: all 30 teams must render`);
    assert.equal(result.cards, 150, `${result.label}: five deterministic cards per team must be audited`);
    assert.deepEqual(result.broken, [], `${result.label}: style attribute must remain intact with a visible computed background`);
  }
  assert.deepEqual(renderAudit.fixedRows.map(row => row.name), ['Reggie Miller','Fred Jones','Primož Brezec','Jamaal Tinsley','Jamison Brewer']);
  assert.ok(renderAudit.fixedRows.every(row => row.intact && row.local.includes('/hupu-era/')), 'the screenshot five must render verified local hupu-era images without style truncation');
  assert.deepEqual(renderAudit.decodedFailures, [], 'every locally preferred image encountered in the 30-team audit must decode');

  const coverage = await page.evaluate(() => {
    function classify(sources) {
      const first = sources.local[0] || '';
      if (/\/hupu-era\//.test(first)) return 'hupu';
      if (/\/nba-official\//.test(first)) return 'official';
      if (first) return 'otherLocal';
      if (sources.remote.length) return 'remote';
      return 'initials';
    }
    function emptyCounter(total) { return { total, hupu:0, official:0, otherLocal:0, remote:0, initials:0, initialsNames:[], initialsReasons:{ excludedOfficialPlaceholder:0, noReliableOfficialId:0, unresolvedOfficialId:0 } }; }
    function count(counter, row) {
      const sources = getPlayerHeadshotSources(row);
      const kind = classify(sources);
      counter[kind]++;
      if (kind !== 'initials') return;
      counter.initialsNames.push(row && (row.nameEN || row.nameEn || row.name) || '');
      const pid = getOfficialPlayerHeadshotId(row);
      if (!pid) counter.initialsReasons.noReliableOfficialId++;
      else if (_hsIsExcludedOfficialId(pid)) counter.initialsReasons.excludedOfficialPlaceholder++;
      else counter.initialsReasons.unresolvedOfficialId++;
    }
    const draftRows = Object.values(window.__PP_ERA_MODE_DATA__.draftClasses).flat();
    const draft = emptyCounter(draftRows.length);
    draftRows.forEach(row => count(draft, row));
    const openings = {};
    [2003,2010,2016].forEach(era => {
      initGame(); STATE.mode='legend'; STATE.eraStart=era; STATE.draftMode='historical'; PP_ERA_MODE.apply(era);
      const players = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).filter(player => player && !player._isUser);
      const counter = openings[era] = emptyCounter(players.length);
      players.forEach(player => count(counter, player));
    });
    return { draft, openings };
  });
  console.log('headshot coverage audit', JSON.stringify(coverage));
  assert.equal(coverage.draft.total, 600);
  assert.ok(coverage.draft.hupu + coverage.draft.official + coverage.draft.otherLocal >= 495, 'at least 82.5% of the formal 600-player draft chain should be local real photos');
  assert.equal(coverage.draft.remote, 0, 'all resolvable official draft IDs should be materialized or excluded as placeholders');
  assert.ok(coverage.draft.initials <= 105, 'unverified players may use initials but must not be assigned random people');
  assert.equal(Object.values(coverage.draft.initialsReasons).reduce((sum, value) => sum + value, 0), coverage.draft.initials, 'every draft fallback must have an auditable reason');
  assert.equal(coverage.draft.initialsReasons.unresolvedOfficialId, 0, 'a reliable official ID must never be left unmaterialized');
  for (const era of [2003,2010,2016]) {
    const row = coverage.openings[era];
    assert.equal(row.total, ({2003:438,2010:426,2016:420})[era]);
    const minimumLocalShare = ({2003:0.86,2010:0.75,2016:0.97})[era];
    assert.ok(row.hupu + row.official + row.otherLocal >= row.total * minimumLocalShare, `${era}: opening league local real-photo coverage must meet the audited target`);
    assert.equal(Object.values(row.initialsReasons).reduce((sum, value) => sum + value, 0), row.initials, `${era}: every fallback must have an auditable reason`);
    assert.equal(row.initialsReasons.unresolvedOfficialId, 0, `${era}: reliable official IDs must be materialized`);
  }

  const draftInsertion = await page.evaluate(() => {
    const cases = [{ era:2003, year:2004 }, { era:2010, year:2011 }, { era:2016, year:2017 }, { era:2016, year:2020 }, { era:2016, year:2022 }];
    return cases.map(item => {
      initGame(); STATE.mode='legend'; STATE.eraStart=item.era; STATE.draftMode='historical'; PP_ERA_MODE.apply(item.era);
      const added = PP_ERA_MODE.addDraftClass(item.year, 0, true);
      const players = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).filter(player => Number(player && player._draftYear) === item.year);
      const host = document.createElement('div'); document.body.appendChild(host);
      const broken = [];
      players.forEach(player => {
        const node = document.createElement('div');
        node.setAttribute('style', getPlayerHeadshotStyle(player, 30));
        host.appendChild(node);
        const style = node.getAttribute('style') || '';
        if (!style.includes("url('") || getComputedStyle(node).backgroundImage === 'none') broken.push(player.nameEN || player.name);
      });
      host.remove();
      return { era:item.era, year:item.year, added, rosterPlayers:players.length, broken };
    });
  });
  draftInsertion.forEach(result => {
    assert.ok(result.added >= 26, `${result.year}: most of the real class must enter league rosters`);
    assert.ok(result.rosterPlayers >= 26, `${result.year}: inserted players must remain addressable in NBA2K_DATA (added=${result.added}, remaining=${result.rosterPlayers})`);
    assert.deepEqual(result.broken, [], `${result.year}: inserted class avatars must render`);
  });

  const identity = await page.evaluate(() => {
    const names = ["Shaquille O'Neal",'Manu Ginóbili',"Amar’e Stoudemire",'Glenn Robinson','Glenn Robinson III','Tim Hardaway','Tim Hardaway Jr.','Larry Nance','Larry Nance Jr.'];
    const paths = Object.fromEntries(names.map(name => [name, resolveVerifiedLocalPlayerHeadshot({ nameEN:name })]));
    initGame(); STATE.mode='legend'; STATE.eraStart=2016; STATE.draftMode='historical'; PP_ERA_MODE.apply(2016);
    const rookie = PP_ERA_MODE.generateRookie('ATL', 2023);
    const sources = getPlayerHeadshotSources(rookie);
    return { paths, rookie:{ local:sources.local, remote:sources.remote, fallback:sources.fallback, style:getPlayerHeadshotStyle(rookie, 30) } };
  });
  assert.ok(identity.paths["Shaquille O'Neal"] && identity.paths['Manu Ginóbili'] && identity.paths["Amar’e Stoudemire"], 'apostrophe/accent aliases must resolve');
  assert.ok(identity.paths['Glenn Robinson'] && identity.paths['Glenn Robinson III'] !== identity.paths['Glenn Robinson'], 'father/son identities must never share a photo');
  assert.ok(identity.paths['Tim Hardaway'] && identity.paths['Tim Hardaway Jr.'] !== identity.paths['Tim Hardaway'], 'suffix-aware official lookup must not collapse Hardaway Jr. onto his father');
  assert.ok(identity.paths['Larry Nance'] && identity.paths['Larry Nance Jr.'] !== identity.paths['Larry Nance'], 'suffix-aware official lookup must not collapse Nance Jr. onto his father');
  assert.deepEqual(identity.rookie.local, []);
  assert.deepEqual(identity.rookie.remote, []);
  assert.ok(identity.rookie.fallback.startsWith('data:image/svg+xml') && identity.rookie.style.includes("url('data:image/svg+xml"));

  const legacyUrlSafety = await page.evaluate(() => {
    const index = window.__PP_ERA_HEADSHOT_INDEX__;
    const excludedId = 3;
    const validId = index.validOfficialIds.find(id => id > 0);
    const nbaUrl = id => `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
    return {
      excludedListed:index.excludedOfficialIds.includes(excludedId),
      excluded:getPlayerHeadshotSources({ name:'Legacy Placeholder', nbaId:excludedId, photoLocal:`assets/images/Player/nba-official/${excludedId}.png`, photoUrl:nbaUrl(excludedId) }),
      validId,
      valid:getPlayerHeadshotSources({ name:'Legacy Valid', nbaId:validId, photoUrl:nbaUrl(validId) }),
      espn:getPlayerHeadshotSources({ name:'Legacy ESPN', nbaId:excludedId, photoUrl:'https://a.espncdn.com/i/headshots/nba/players/full/3.png' }),
      custom:getPlayerHeadshotSources({ name:'Legacy Custom', nbaId:excludedId, photoUrl:'https://example.com/player/custom-avatar.png' })
    };
  });
  assert.equal(legacyUrlSafety.excludedListed, true, 'fixture ID 3 must remain a known NBA placeholder');
  assert.deepEqual(legacyUrlSafety.excluded.local, [], 'stale excluded local path must not survive old-save resolution');
  assert.deepEqual(legacyUrlSafety.excluded.remote, [], 'stale excluded NBA CDN URL must not survive old-save resolution');
  assert.ok(legacyUrlSafety.excluded.fallback.startsWith('data:image/svg+xml'), 'excluded old save must use initials fallback');
  assert.ok(legacyUrlSafety.valid.local.some(url => url.endsWith(`/${legacyUrlSafety.validId}.png`)));
  assert.ok(legacyUrlSafety.valid.remote.some(url => url.endsWith(`/${legacyUrlSafety.validId}.png`)));
  assert.deepEqual(legacyUrlSafety.espn.remote, ['https://a.espncdn.com/i/headshots/nba/players/full/3.png']);
  assert.deepEqual(legacyUrlSafety.custom.remote, ['https://example.com/player/custom-avatar.png']);
  assert.deepEqual(pageErrors, [], `page errors are not allowed: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ passed:true, renderAudit:{ modes:renderAudit.modeResults, decodedLocal:renderAudit.decodedCount }, coverage, draftInsertion, identity, legacyUrlSafety }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
