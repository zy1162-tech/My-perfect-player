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
  await page.evaluate(async () => {
    await window.__PP_ensure('create');
    if (window.PERFECT_PLAYER_DATA_READY) await window.PERFECT_PLAYER_DATA_READY;
  });

  const currentAudit = await page.evaluate(() => {
    const runtimeByName = {};
    const ambiguous = {};
    Object.keys(NBA_CURRENT_RATINGS_2026).forEach(key => {
      const name = PP_RATING_CALIBRATION.nameKey(key.slice(key.indexOf('|') + 1));
      if (runtimeByName[name]) ambiguous[name] = true;
      else runtimeByName[name] = NBA_CURRENT_RATINGS_2026[key];
    });
    Object.keys(ambiguous).forEach(name => delete runtimeByName[name]);
    const attrs = ['ovr','threePT','MID','FIN','DNK','HAN','PAS','PDEF','IDEF','BLK','REB','ATH','STR','CLU'];
    let cards = 0, matched = 0;
    const mismatches = [];
    Object.keys(PERFECT_PLAYER_BUILD_DATA).forEach(team => {
      (PERFECT_PLAYER_BUILD_DATA[team] || []).filter(card => card._sourceKind === 'current').forEach(card => {
        cards++;
        const runtime = NBA_CURRENT_RATINGS_2026[team + '|' + card.name] || runtimeByName[PP_RATING_CALIBRATION.nameKey(card.name)];
        if (!runtime) return;
        matched++;
        const diff = attrs.filter(attr => Number(card[attr]) !== Number(runtime[attr]));
        if (diff.length) mismatches.push({ team, name:card.name, diff, cardOvr:card.ovr, runtimeOvr:runtime.ovr });
      });
    });
    const peakExpected = { 'Charles Barkley':96, 'Marc Gasol':93, 'Reggie Miller':92, 'Vince Carter':96, 'Tony Parker':95, 'Donovan Mitchell':93, 'Tony Allen':85 };
    const surprises = Object.values(PERFECT_PLAYER_HISTORICAL_SURPRISE_DATA).flat();
    const peaks = {};
    Object.entries(peakExpected).forEach(([name, expected]) => {
      const cardsForName = surprises.filter(card => card.name === name);
      peaks[name] = cardsForName.map(card => ({ ovr:card.ovr, source:card._sourceOvr, peak:card._peakOvr, basis:card._ratingReference && card._ratingReference.basis }));
    });
    const aliasExpected = {
      'Craig Porter':'CLE|Craig Porter Jr.', 'A.J. Green':'MIL|AJ Green',
      'Marvin Bagley':'DEN|Marvin Bagley III', 'Robert Williams':'POR|Robert Williams III'
    };
    const aliasMatches = {};
    Object.entries(aliasExpected).forEach(([cardName, runtimeKey]) => {
      const card = Object.values(PERFECT_PLAYER_BUILD_DATA).flat().find(item => item._sourceKind === 'current' && item.name === cardName);
      const runtime = NBA_CURRENT_RATINGS_2026[runtimeKey];
      aliasMatches[cardName] = { found:!!card, runtime:!!runtime,
        diff:card && runtime ? attrs.filter(attr => Number(card[attr]) !== Number(runtime[attr])) : ['missing'] };
    });
    return { cards, matched, mismatches, aliasMatches, peaks, version:PP_RATING_CALIBRATION.version };
  });
  assert.equal(currentAudit.version, '20260826-rating-calibration-v2');
  assert.ok(currentAudit.matched >= 330, `expected runtime matches for over 90% of current cards, got ${currentAudit.matched}/${currentAudit.cards}`);
  assert.deepEqual(currentAudit.mismatches, [], 'current build cards must use the same OVR and attributes as NBA_CURRENT_RATINGS_2026');
  for (const [name, row] of Object.entries(currentAudit.aliasMatches)) {
    assert.ok(row.found && row.runtime, `${name}: verified alias endpoints must exist`);
    assert.deepEqual(row.diff, [], `${name}: verified alias card must use runtime attributes`);
  }
  for (const [name, expected] of Object.entries({ 'Charles Barkley':96, 'Marc Gasol':93, 'Reggie Miller':92, 'Vince Carter':96, 'Tony Parker':95, 'Donovan Mitchell':93, 'Tony Allen':85 })) {
    assert.ok(currentAudit.peaks[name].length > 0, `${name}: historical surprise card missing`);
    assert.ok(currentAudit.peaks[name].every(card => card.ovr === expected && card.peak === expected), `${name}: historical peak override not wired into production conversion`);
  }

  const eraAudit = await page.evaluate(() => {
    function norm(value) {
      return String(value || '').replace(/amar['’\- ]e/ig, 'amare').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }
    const expectedNames = {
      2003:["Amar'e Stoudemire",'Zydrunas Ilgauskas','Michael Redd','Tony Parker','Andrei Kirilenko'],
      2010:['Monta Ellis','Tyreke Evans','Danilo Gallinari','Stephen Curry','Andrew Bogut','Marc Gasol'],
      2016:['Kristaps Porzingis','Nikola Jokic','Devin Booker','Zach LaVine']
    };
    const output = {};
    [2003,2010,2016].forEach(era => {
      initGame(); STATE.mode='legend'; STATE.eraStart=era; STATE.draftMode='historical';
      applyLegendEraLeague();
      const players = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).filter(player => player && !player._isUser);
      const values = players.map(player => Number(player.ovr));
      const picked = {};
      expectedNames[era].forEach(name => {
        const matches = players.filter(player => norm(player.nameEN || player.name) === norm(name));
        picked[name] = matches.map(player => ({ ovr:player.ovr, age:player._age, source:player._sourceOvr,
          season:player._seasonOvr, rookie:player._rookieOvr, peak:player._peakOvr,
          kind:player._ratingKind, version:player._ratingCalibrationVersion }));
      });
      const rookies = players.filter(player => player._ratingKind === 'rookie');
      output[era] = {
        total:players.length,
        unique:new Set(values).size,
        exact70:values.filter(value => value === 70).length,
        below70:values.filter(value => value < 70).length,
        min:Math.min(...values), max:Math.max(...values), picked,
        rookies:rookies.map(player => ({ name:player.nameEN || player.name, ovr:player.ovr, source:player._sourceOvr,
          rookie:player._rookieOvr, peak:player._peakOvr, potential:player._potential }))
      };
    });
    // Re-entering an already-applied era is the old-save path. Even a player
    // carrying prime-floor metadata must keep the saved OVR and attributes.
    initGame(); STATE.mode='legend'; STATE.eraStart=2003; STATE.draftMode='historical'; applyLegendEraLeague();
    const legacyPlayer = NBA2K_TEAMS.flatMap(team => NBA2K_DATA[team] || []).find(player => norm(player && (player.nameEN || player.name)) === norm("Amar'e Stoudemire"));
    const legacyName = legacyPlayer.nameEN || legacyPlayer.name;
    legacyPlayer.ovr = 77;
    const beforeFin = legacyPlayer.FIN;
    delete legacyPlayer._ratingCalibrationVersion;
    delete legacyPlayer._ratingReference;
    applyLegendEraLeague();
    return { output, oldSave:{ name:legacyName, ovr:legacyPlayer.ovr, fin:legacyPlayer.FIN, beforeFin,
      primeFloor:legacyPlayer._primeFloorOvr, version:legacyPlayer._ratingCalibrationVersion || null } };
  });

  const exact = {
    2003:{ "Amar'e Stoudemire":85, 'Zydrunas Ilgauskas':84, 'Michael Redd':86, 'Tony Parker':84, 'Andrei Kirilenko':87 },
    2010:{ 'Monta Ellis':85, 'Tyreke Evans':82, 'Danilo Gallinari':80, 'Stephen Curry':82, 'Andrew Bogut':84, 'Marc Gasol':83 },
    2016:{ 'Kristaps Porzingis':84, 'Nikola Jokic':86, 'Devin Booker':82, 'Zach LaVine':82 }
  };
  for (const era of [2003,2010,2016]) {
    const audit = eraAudit.output[era];
    assert.ok(audit.total >= 420 && audit.total <= 450, `${era}: shifted opening roster size ${audit.total}`);
    assert.ok(audit.unique >= 24 && audit.exact70 < 55 && audit.below70 > 10, `${era}: opening distribution regressed to a flat floor`);
    for (const [name, ovr] of Object.entries(exact[era])) {
      assert.equal(audit.picked[name].length, 1, `${era} ${name}: must exist exactly once`);
      assert.equal(audit.picked[name][0].ovr, ovr, `${era} ${name}: target-season OVR`);
      assert.equal(audit.picked[name][0].season, ovr);
      assert.equal(audit.picked[name][0].kind, 'season');
    }
    assert.ok(audit.rookies.length > 0, `${era}: opening should contain the era's actual rookie class`);
    assert.ok(audit.rookies.every(player => player.ovr === player.source && player.rookie === player.source), `${era}: rookie OVR must remain separate from peak/potential`);
  }
  const amare = eraAudit.output[2003].picked["Amar'e Stoudemire"][0];
  assert.deepEqual({ ovr:amare.ovr, age:amare.age, source:amare.source, peak:amare.peak }, { ovr:85, age:21, source:69, peak:92 });
  assert.equal(eraAudit.oldSave.ovr, 77, 'already-applied old saves must not receive new opening calibration');
  assert.equal(eraAudit.oldSave.fin, eraAudit.oldSave.beforeFin, 'old-save attributes must not be ratio-scaled by primeFloor');
  assert.ok(eraAudit.oldSave.primeFloor > 77, 'fixture must exercise a real prime-floor player');
  assert.equal(eraAudit.oldSave.version, null, 'old-save compatibility test must not be silently version-stamped');
  assert.deepEqual(pageErrors, [], `browser page errors are not allowed: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ passed:true, currentAudit, eraAudit, pageErrors }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
