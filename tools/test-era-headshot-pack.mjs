import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sandbox = { window:{} };
vm.runInNewContext(read('assets/data/era-headshot-index.js'), sandbox);
const index = sandbox.window.__PP_ERA_HEADSHOT_INDEX__;
assert.equal(index.version, '20260826-era-headshots-v1');
assert.equal(index.upstreamAssetCount, 934);
assert.equal(index.upstreamAssetBytes, 98508129);
assert.equal(index.auditedRealPlayers, 1291);
assert.ok(index.mappedRealPlayers >= 450);

const hupuDir = path.join(root, 'assets/images/Player/hupu-era');
const hupuFiles = fs.readdirSync(hupuDir).filter(name => fs.statSync(path.join(hupuDir, name)).isFile());
assert.equal(hupuFiles.length, 934);
assert.equal(hupuFiles.reduce((sum, name) => sum + fs.statSync(path.join(hupuDir, name)).size, 0), 98508129);
assert.deepEqual([...index.excludedHupuFiles].sort(), ['bendavis.png','charlessmith.png','dalewilkinson.png','jamiefeick.png','scootermccray.png','tomsewell.png']);

const officialDir = path.join(root, 'assets/images/Player/nba-official');
assert.equal(index.validOfficialIds.length, 1035, 'only unique decoded official files may be treated as local photos');
assert.equal(index.excludedOfficialIds.length, 456, 'downloaded generic NBA placeholders must be explicitly suppressed locally and remotely');
const placeholderHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(officialDir, '0.png'))).digest('hex');
const supplementalOfficialIds = [204002, 1627775, 1627823, 2403];
const supplementalHashes = new Set();
for (const id of supplementalOfficialIds) {
  const file = path.join(officialDir, `${id}.png`);
  assert.ok(fs.existsSync(file), `supplemental verified NBA headshot missing: ${id}`);
  const buffer = fs.readFileSync(file);
  assert.ok(buffer.length >= 4096, `supplemental headshot is suspiciously small: ${id}`);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${id} must be a PNG`);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.notEqual(hash, placeholderHash, `${id} must not be the shared NBA placeholder`);
  supplementalHashes.add(hash);
}
assert.equal(supplementalHashes.size, supplementalOfficialIds.length, 'supplemental players must not share a generic image');
for (const id of index.excludedOfficialIds) {
  const file = path.join(officialDir, `${id}.png`);
  assert.ok(fs.existsSync(file), `excluded official placeholder should remain auditable: ${id}`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), placeholderHash, `${id} must be excluded only because it is the known shared placeholder`);
}
for (const id of index.validOfficialIds) {
  const file = path.join(officialDir, `${id}.png`);
  assert.ok(fs.existsSync(file), `valid official headshot missing: ${id}`);
  assert.notEqual(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), placeholderHash, `${id} must not be the shared placeholder`);
}

for (const [key, record] of Object.entries(index.players)) {
  assert.match(record.p, /^assets\/(?:images\/Player\/(?:hupu-era|historical-nba)|data\/historical\/headshots)\//, `${key} needs a known local asset class`);
  const file = path.join(root, ...record.p.split('/'));
  assert.ok(fs.existsSync(file), `${key} mapped file missing: ${record.p}`);
  if (record.p.includes('/hupu-era/')) assert.ok(!index.excludedHupuFiles.some(name => record.p.endsWith('/' + name)), `${key} must not map a generic silhouette`);
}
for (const [name, expected] of Object.entries({
  reggiemiller:'reggiemiller.jpg', fredjones:'fredjones.jpg', primozbrezec:'primozbrezec.png',
  jamaaltinsley:'jamaaltinsley.jpg', jamisonbrewer:'jamisonbrewer.png'
})) assert.ok(index.players[name].p.endsWith('/' + expected), `${name} screenshot regression needs its verified local file`);
assert.ok(index.players.glennrobinson.p.endsWith('/glennrobinson.jpg'));
assert.equal(index.players.glennrobinsoniii, undefined, 'son must not inherit father photo');
assert.ok(index.players.timhardaway.p);
assert.equal(index.players.timhardawayjr, undefined);
assert.ok(index.players.larrynance.p);
assert.equal(index.players.larrynancejr, undefined);
assert.equal(index.players.jarenjacksonjr, undefined, 'an upstream alias that drops Jr. must not be accepted');
assert.equal(index.players.jabarismithjr, undefined, 'a suffix-collapsing exact alias must remain on safe fallback');

const html = read('nba-perfect-player.html');
const eraMode = read('assets/js/perfect-player-era-mode.js');
const generator = read('tools/generate-era-headshot-index.mjs');
const css = read('assets/css/perfect-player.css');
const sw = read('sw.js');
assert.match(html, /function _hsCssBgUrl\(url\)[\s\S]*return "url\('"/);
assert.match(html, /urls\.map\(_hsCssBgUrl\)/);
assert.match(html, /function _hsOfficialIdFromRemoteUrl\(remoteUrl\)/);
assert.match(html, /urlPlayerId && \(_hsIsExcludedOfficialId\(urlPlayerId\) \|\| _hsIsExcludedOfficialId\(playerId\)\)/, 'stale NBA CDN URLs from excluded old-save IDs must be filtered');
assert.match(html, /_hsIsReliableRecordRemote\(recordRemote, pid\)/);
assert.match(html, /var indexedLocal = resolveVerifiedLocalPlayerHeadshot\(player\);[\s\S]*player\.photoLocal = indexedLocal;[\s\S]*player\.photoUrl = indexedLocal;/, 'attach must expose verified local assets through both legacy photo fields');
assert.match(html, /if \(_hsHasLocalOfficialId\(pid\)\)[\s\S]*player\.photoLocal = officialLocal;[\s\S]*player\.photoUrl = officialLocal;/, 'verified official local IDs must not be overwritten by CDN URLs');
assert.match(html, /player\.photoUrl = _hsOfficialRemotePath\(pid\);[\s\S]*player\.photoStatus = 'remote';/, 'remote CDN is only the final non-excluded fallback');
assert.doesNotMatch(html.match(/function getPlayerHeadshotStyle[\s\S]*?\n\}/)[0], /url\("/);
assert.doesNotMatch(css, /\.bp-headshot:empty|\.bl-headshot:empty/);
assert.match(eraMode, /photoLocal: presentation\.p \|\| ''/);
assert.match(generator, /recordsByExactAlias\.get\(exactTextKey\(name\)\)/, 'generator should audit exact upstream alias records');
assert.match(generator, /generationSuffix\(name\) !== generationSuffix\(record\.e\)/, 'exact alias recovery must preserve generational suffix identity');
assert.match(generator, /loadTopLevelObject\(path\.resolve\(officialNamesPath\), 'NBA_PLAYER_IMAGES'\)/, 'generator must safely parse the upstream name-to-ID source in an isolated VM');
assert.match(generator, /officialLookupKeys\(name\)[\s\S]*officialCandidates\.get\(key\)/, 'generator must normalize direct and Last, First identities before resolving');
assert.match(generator, /ids && ids\.size === 1/, 'only unique normalized identity-to-ID matches may be emitted');
assert.match(generator, /excludedOfficialSet\.has\(String\(id\)\).*?!validOfficialSet\.has\(String\(id\)\)/, 'excluded, missing, or placeholder official IDs must not enter the generated map');
assert.match(generator, /version:'20260827-era-headshots-v2'/);
assert.match(html, /var PERFECT_PLAYER_EXTRA_VERIFIED_OFFICIAL_IDS = \[204002, 1627775, 1627823, 2403\]/);
assert.match(html, /else if \(candidates\[key\] !== id\) candidates\[key\] = 0/, 'runtime lookup must reject normalized-name collisions');
assert.ok(html.indexOf('script-00-2678-58zyeprc-upload-1783508428855-12.js?v=20260827-verified-names-v1') < html.indexOf('function _hsGetNormIndex()'), 'the verified name map must load before resolver construction');
assert.ok(html.indexOf('era-headshot-index.js?v=20260826-era-headshots-v1') < html.indexOf('perfect-player-core.js?v='));
assert.match(html, /perfect-player-era-mode\.js\?v=20260826-rating-v31/);
assert.match(html, /perfect-player\.css\?v=20260826-era-headshots-v2/);
assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ '20260827-local-headshot-attach-v17'/);
assert.match(sw, /\.\/assets\/js\/hupu\/script-00-2678-58zyeprc-upload-1783508428855-12\.js\?v=20260827-verified-names-v1/);
assert.doesNotMatch(sw, /['"]\.\/assets\/images\/Player\/(?:hupu-era|nba-official)\//, 'large on-demand image directories must not be install-shell entries');

console.log(`✓ era headshot pack: hupu ${hupuFiles.length}/${index.upstreamAssetBytes} bytes; mapped identities ${index.mappedRealPlayers}; valid official ${index.validOfficialIds.length}; placeholders excluded ${index.excludedOfficialIds.length}`);
