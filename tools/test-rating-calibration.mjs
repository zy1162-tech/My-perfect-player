import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sandbox = { window:{} };
function load(rel) { vm.runInNewContext(read(rel), sandbox, { filename:rel }); }
load('assets/data/era-complete-rosters.js');
load('assets/data/era-mode-data.js');
load('assets/data/player-rating-calibration.js');

const calibration = sandbox.window.PP_RATING_CALIBRATION;
const rosters = sandbox.window.__PP_COMPLETE_ERA_ROSTERS__;
const draftClasses = sandbox.window.__PP_ERA_MODE_DATA__.draftClasses;
assert.equal(calibration.version, '20260826-rating-calibration-v2');
assert.deepEqual(Array.from(calibration.bands, band => band.min), [96,93,89,85,80,75,70]);

function allRows(era) { return Object.values(rosters[String(era)]).flat(); }
function normalized(name) { return calibration.nameKey(name); }
function findRow(era, name) { return allRows(era).find(row => normalized(row.nameEn) === normalized(name)); }
function result(era, name) {
  const row = findRow(era, name);
  assert.ok(row, `${era} missing ${name}`);
  return calibration.calibrateEra(row, { eraStart:era, sourceOvr:row.ovr, targetAge:Number(row.age) + 1, kind:'season' });
}

const amare = result(2003, "Amar'e Stoudemire");
assert.equal(amare.sourceOvr, 69);
assert.equal(amare.seasonOvr, 85);
assert.equal(amare.targetAge, 21);
assert.equal(amare.peakOvr, 92);
assert.equal(amare.reference.override, true);

const expected = {
  2003:{ 'Zydrunas Ilgauskas':84, 'Michael Redd':86, 'Tony Parker':84, 'Andrei Kirilenko':87 },
  2010:{ 'Monta Ellis':85, 'Tyreke Evans':82, 'Danilo Gallinari':80, 'Stephen Curry':82, 'Andrew Bogut':84, 'Marc Gasol':83 },
  2016:{ 'Kristaps Porzingis':84, 'Nikola Jokic':86, 'Devin Booker':82, 'Zach LaVine':82 }
};
for (const [era, players] of Object.entries(expected)) {
  for (const [name, ovr] of Object.entries(players)) assert.equal(result(Number(era), name).seasonOvr, ovr, `${era} ${name}`);
}

const distributions = {};
for (const era of [2003,2010,2016]) {
  const rows = allRows(era);
  const values = rows.map(row => calibration.calibrateEra(row, {
    eraStart:era, sourceOvr:row.ovr, targetAge:Number(row.age) + 1, kind:'season'
  }).seasonOvr);
  const unique = new Set(values).size;
  const exact70 = values.filter(value => value === 70).length;
  const below70 = values.filter(value => value < 70).length;
  assert.ok(unique >= 24, `${era}: target-season calibration needs a continuous distribution`);
  assert.ok(exact70 < 55, `${era}: flat 70 floor must not return`);
  assert.ok(below70 > 20, `${era}: fringe players should retain separation below the bench band`);
  const deltas = values.map((value, index) => value - Number(rows[index].ovr));
  const raised = deltas.filter(value => value > 0).length;
  const lowered = deltas.filter(value => value < 0).length;
  assert.ok(raised < rows.length * 0.80, `${era}: calibration must not raise almost the entire roster`);
  assert.ok(lowered >= rows.length * 0.08, `${era}: source ratings are references, not one-way floors`);
  distributions[era] = { min:Math.min(...values), max:Math.max(...values), unique, exact70, below70,
    raised, lowered, unchanged:rows.length - raised - lowered,
    meanDelta:Number((deltas.reduce((sum, value) => sum + value, 0) / rows.length).toFixed(2)) };
}

for (const [era, name, ceiling] of [[2003,'Damone Brown',69],[2010,'Earl Barron',74],[2016,'Duje Dukan',69]]) {
  const sample = result(era, name);
  assert.ok(sample.seasonOvr <= ceiling, `${name}: tiny reference-season sample must not create a rotation/star jump`);
  assert.ok(sample.reference.reliability < 0.2, `${name}: sample must be strongly shrunk`);
  assert.equal(sample.reference.referenceSeason, `${era - 1}-${String(era).slice(-2)}`);
}

const everyDraftRow = Object.values(draftClasses).flat();
assert.equal(everyDraftRow.length, 600);
for (const row of everyDraftRow) {
  const rookie = calibration.calibrateEra(row, { sourceOvr:row.rating, targetAge:row.age || 20, kind:'rookie' });
  assert.equal(rookie.rookieOvr, Number(row.rating), `${row.nameEn}: rookie OVR must remain the class rating`);
  assert.equal(rookie.seasonOvr, Number(row.rating));
}
assert.ok(everyDraftRow.some(row => Number(row.rating) < 70), 'draft test must cover ratings formerly flattened to 70');

for (const [name, peak] of Object.entries({
  'Charles Barkley':96, 'Marc Gasol':93, 'Reggie Miller':92, 'Vince Carter':96,
  'Tony Parker':95, 'Donovan Mitchell':93, 'Tony Allen':85
})) assert.equal(calibration.peakFor(name, 50), peak, `${name} peak`);

const html = read('nba-perfect-player.html');
const eraMode = read('assets/js/perfect-player-era-mode.js');
const extension = read('assets/js/perfect-player-hupu-extensions.js');
const sw = read('sw.js');
assert.ok(html.indexOf('player-rating-calibration.js?v=20260826-rating-v2') < html.indexOf('perfect-player-era-mode.js?v=20260826-rating-v31'));
assert.match(html, /current-player-ratings-2026\.js\?v=20260826-rating-v1/);
assert.doesNotMatch(eraMode, /ERA_PLAYABLE_OVR_FLOOR|applyYoungStarOpeningFloor/);
assert.match(eraMode, /_sourceOvr: Number\(rating\.sourceOvr\)/);
assert.match(eraMode, /_seasonOvr: options\.ratingKind === 'rookie' \? null : ovr/);
assert.match(eraMode, /_rookieOvr: options\.ratingKind === 'rookie' \? ovr : null/);
assert.match(extension, /findRuntimeCurrentRating\(teamAbbr, playerName\)/);
assert.match(extension, /NBA_CURRENT_RATINGS_2026 runtime source/);
assert.match(extension, /calibration\.peakFor\(playerName, sourceRating\)/);
assert.match(sw, /player-rating-calibration\.js\?v=20260826-rating-v2/);
assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ '20260827-new-career-system-reset-v16'/);

console.log('✓ rating calibration', JSON.stringify({ distributions, amare, draftRows:everyDraftRow.length }));
