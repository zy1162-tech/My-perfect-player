import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const presentationSource = read('assets/data/era-presentation.js');
const headshotIndexSource = read('assets/data/era-headshot-index.js');
const eraMode = read('assets/js/perfect-player-era-mode.js');
const core = read('assets/js/perfect-player-core.js');
const html = read('nba-perfect-player.html');
const sw = read('sw.js');
const sandbox = { window:{} };
vm.runInNewContext(presentationSource, sandbox, { filename:'era-presentation.js' });
vm.runInNewContext(headshotIndexSource, sandbox, { filename:'era-headshot-index.js' });

const manifest = sandbox.window.__PP_ERA_PRESENTATION__;
const cnFixes = sandbox.window.__PP_ERA_PRESENTATION_CN_FIXES__;
const headshotIndex = sandbox.window.__PP_ERA_HEADSHOT_INDEX__;
assert.ok(manifest && cnFixes, 'presentation globals must load without the app runtime');
assert.equal(manifest.version, '20260826-era-presentation-v2');
assert.equal(manifest.actualRealPlayers, 1232, 'manifest must describe the audited playable real-player union');
assert.equal(manifest.selectedPhotoCount, 336, 'manifest must pin the selected upstream image count');
assert.ok(manifest.players.glennrobinson.p, 'Glenn Robinson must retain his verified photo');
assert.equal(Object.keys(manifest.players.glennrobinsoniii).length, 0, 'Glenn Robinson III must have a separate suffix-preserving key and use initials');
assert.equal(Object.hasOwn(manifest.players, 'charlessmith'), false, 'the generic Charles Smith silhouette must not remain mapped');

const entries = Object.entries(manifest.players);
const localized = entries.filter(([, value]) => value.c);
assert.equal(localized.length, 306, 'all audited runtime Chinese-name gaps must be represented');
for (const [key, value] of localized) {
  const effective = cnFixes[key] || value.c;
  assert.match(effective, /[\u3400-\u9fff]/, `${key} must resolve to a genuinely Chinese display name`);
}
for (const [key, value] of Object.entries(cnFixes)) {
  assert.ok(manifest.players[key], `${key} override must refer to an audited runtime player`);
  assert.match(value, /[\u3400-\u9fff]/, `${key} override must contain Chinese characters`);
}

const mappedPaths = [...new Set(entries.map(([, value]) => value.p).filter(Boolean))];
const selectedPaths = mappedPaths.filter(rel => rel.startsWith('assets/images/Player/hupu-era/'));
assert.equal(selectedPaths.length, 336, 'exactly the selected 336 hupu-era assets must be mapped');
for (const rel of mappedPaths) {
  const absolute = path.join(root, ...rel.split('/'));
  assert.ok(fs.existsSync(absolute), `mapped avatar must exist: ${rel}`);
  const signature = fs.readFileSync(absolute).subarray(0, 4);
  const isPng = signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isWebp = signature.toString('ascii') === 'RIFF';
  assert.ok(isPng || isJpeg || isWebp, `mapped avatar must be a valid PNG/JPEG/WebP: ${rel}`);
}
const selectedDir = path.join(root, 'assets/images/Player/hupu-era');
const selectedFiles = fs.readdirSync(selectedDir).filter(file => fs.statSync(path.join(selectedDir, file)).isFile());
const selectedBytes = selectedFiles.reduce((sum, file) => sum + fs.statSync(path.join(selectedDir, file)).size, 0);
assert.equal(selectedFiles.length, 934, 'authorized full hupu-era pack must match upstream file count');
assert.equal(selectedBytes, 98508129, 'authorized full hupu-era pack must match upstream bytes');
assert.equal(headshotIndex.upstreamAssetCount, 934);
assert.equal(headshotIndex.upstreamAssetBytes, 98508129);
assert.ok(headshotIndex.excludedHupuFiles.includes('charlessmith.png'), 'known generic silhouettes must remain physically available but never be identity-mapped');
headshotIndex.excludedHupuFiles.forEach(file => {
  assert.ok(fs.statSync(path.join(selectedDir, file)).size < 4096, `${file} should be excluded by the placeholder quality gate`);
  assert.ok(!Object.values(headshotIndex.players).some(record => record.p && record.p.endsWith('/' + file)), `${file} must not be mapped to a player`);
});

assert.match(eraMode, /function presentationKey\(value\)[\s\S]*replace\(\/\\s\+\/g, ''\)/, 'presentation lookup must use its own suffix-preserving key');
assert.match(eraMode, /var key = presentationKey\(name\)/);
assert.doesNotMatch(eraMode.match(/function presentationKey[\s\S]*?\n  \}/)[0], /\(jr\|sr\|ii\|iii\|iv\)/, 'display lookup must not strip generational suffixes');
assert.match(eraMode, /row\.nameCn && \/\[\\u3400-\\u9fff\]\//, 'English text in nameCn must not count as localized');
for (const field of ['photoLocal','photoUrl','nbaId','photoSource','photoStatus']) {
  assert.match(eraMode, new RegExp(`${field}:`), `makePlayer must preserve ${field}`);
}
assert.match(eraMode, /if \(!player\._eraGenerated\)[\s\S]*presentation\.p[\s\S]*selected-era-headshot/, 'old saves must lazily regain selected real-player avatars');
assert.match(eraMode, /player\.photoLocal = '';[\s\S]*player\.photoUrl = '';[\s\S]*player\.nbaId = 0;[\s\S]*generated-initials/, 'generated prospects must discard real-person avatar identity fields');

for (const [english, chinese] of Object.entries({
  'Trey Lyles':'特雷-莱尔斯',
  'Adam Flagler':'亚当-弗拉格勒',
  'Mo Bamba':'穆罕默德-班巴',
  'Tamar Bates':'塔马尔-贝茨'
})) {
  assert.ok(html.includes(`'${english}': '${chinese}'`), `${english} must have a base-roster Chinese display fix`);
}
assert.match(html, /window\.applyCurrentPlayerChineseDisplayFixes = function/);
assert.match(html, /window\.applyCurrentPlayerChineseDisplayFixes\(\)/, 'fresh current rosters must be fixed at initial load');
assert.match(core, /Object\.assign\(NBA2K_DATA, snap\.league\);\s*if \(typeof applyCurrentPlayerChineseDisplayFixes === 'function'\) applyCurrentPlayerChineseDisplayFixes\(\);/, 'loaded current leagues must be fixed after snap.league overwrites the base roster');
const presentationTag = 'assets/data/era-presentation.js?v=20260826-era-presentation-v2';
const eraModeTag = 'assets/js/perfect-player-era-mode.js?v=20260826-rating-v31';
assert.ok(html.indexOf(presentationTag) >= 0 && html.indexOf(presentationTag) < html.indexOf(eraModeTag), 'presentation data must load before era runtime');
assert.ok(sw.includes(`'./${presentationTag}'`), 'service-worker shell must cache the exact presentation URL');
assert.ok(sw.includes(`'./${eraModeTag}'`), 'service-worker shell must cache the exact era runtime URL');
assert.ok(html.includes('assets/js/perfect-player-core.js?v=20260827-new-career-system-reset-v32'));
assert.ok(sw.includes("'./assets/js/perfect-player-core.js?v=20260827-new-career-system-reset-v32'"));
assert.ok(html.includes('assets/data/era-headshot-index.js?v=20260826-era-headshots-v1'));
assert.ok(sw.includes("'./assets/data/era-headshot-index.js?v=20260826-era-headshots-v1'"));
assert.doesNotMatch(sw, /['"]\.\/assets\/images\/Player\/hupu-era\//, '934 large images must remain runtime cache-first, not install-shell assets');
assert.match(sw, /CACHE_PREFIX = 'perfect-player-shell-'[\s\S]*CACHE_NAME = CACHE_PREFIX \+ '20260827-local-headshot-attach-v17'/);
assert.match(html, /urls\.push\(sources\.fallback\)/, 'real-player URLs must always end with a stable initials fallback');
assert.match(html, /function _hsCssBgUrl\(url\)[\s\S]*return "url\('\"/, 'CSS URLs must use quotes that are safe inside double-quoted style attributes');

console.log(`✓ era presentation: ${localized.length} Chinese fixes, ${selectedFiles.length} selected avatars, ${(selectedBytes / 1048576).toFixed(2)} MiB`);
