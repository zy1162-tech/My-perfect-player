import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamPath = process.argv[2];
const outputPath = process.argv[3];
const officialNamesPath = process.argv[4] || path.join(root, 'assets/js/hupu/script-00-2678-58zyeprc-upload-1783508428855-12.js');
if (!upstreamPath || !outputPath) {
  throw new Error('usage: node tools/generate-era-headshot-index.mjs <hupu-player-photos.js> <output.js> [nba-player-images.js]');
}

function loadWindowScript(file) {
  const context = { window:{} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename:file });
  return context.window;
}
function loadTopLevelObject(file, identifier) {
  const context = Object.create(null);
  const source = fs.readFileSync(file, 'utf8');
  vm.runInNewContext(`${source}\n;this.__PP_EXTRACTED__=(typeof ${identifier}==='object'&&${identifier})||null;`, context, { filename:file, timeout:5000 });
  const result = context.__PP_EXTRACTED__;
  if (!result || Array.isArray(result)) throw new Error(`invalid ${identifier} source: ${file}`);
  return result;
}
function displayKey(value) {
  let text = String(value || '').trim().replace(/amar['’\- ]e/ig, 'amare');
  if (text.normalize) text = text.normalize('NFKD');
  return text.replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '');
}
function exactTextKey(value) {
  let text = String(value || '').trim().replace(/amar['’\- ]e/ig, 'amare');
  if (text.normalize) text = text.normalize('NFKD');
  return text.replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, '');
}
function compactName(value) { return displayKey(value); }
function generationSuffix(value) {
  const text = String(value || '').trim().toLowerCase().replace(/\./g, '');
  const match = text.match(/(?:^|[\s,])(jr|sr|ii|iii|iv)$/);
  return match ? match[1] : '';
}
function officialLookupKeys(value) {
  const text = String(value || '').trim();
  const keys = new Set();
  const direct = displayKey(text);
  if (direct) keys.add(direct);
  const comma = text.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    const reordered = displayKey(`${comma[2]} ${comma[1]}`);
    if (reordered) keys.add(reordered);
  }
  return [...keys];
}
function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function scanFiles(relativeDir) {
  const absoluteDir = path.join(root, ...relativeDir.split('/'));
  const files = fs.readdirSync(absoluteDir).filter(name => fs.statSync(path.join(absoluteDir, name)).isFile());
  const hashes = new Map();
  const byLowerName = new Map();
  files.forEach(name => {
    const absolute = path.join(absoluteDir, name);
    const item = { name, absolute, size:fs.statSync(absolute).size, hash:hashFile(absolute) };
    byLowerName.set(name.toLowerCase(), item);
    if (!hashes.has(item.hash)) hashes.set(item.hash, []);
    hashes.get(item.hash).push(item);
  });
  return { relativeDir, files, hashes, byLowerName };
}
function invalidHashes(scan, minimumDuplicates, minimumBytes) {
  const invalid = new Set();
  scan.hashes.forEach(group => {
    if (group.length >= minimumDuplicates || group[0].size < minimumBytes) invalid.add(group[0].hash);
  });
  return invalid;
}

const complete = loadWindowScript(path.join(root, 'assets/data/era-complete-rosters.js')).__PP_COMPLETE_ERA_ROSTERS__;
const eraData = loadWindowScript(path.join(root, 'assets/data/era-mode-data.js')).__PP_ERA_MODE_DATA__;
const presentation = loadWindowScript(path.join(root, 'assets/data/era-presentation.js')).__PP_ERA_PRESENTATION__;
const upstream = loadWindowScript(path.resolve(upstreamPath)).HUPU_PLAYER_PHOTOS;
if (!upstream || !upstream.lookup) throw new Error('invalid upstream HUPU_PLAYER_PHOTOS source');
const officialNames = loadTopLevelObject(path.resolve(officialNamesPath), 'NBA_PLAYER_IMAGES');

const identities = new Map();
function remember(row, meta) {
  const name = row && (row.nameEn || row.nameEN || row.name);
  const key = displayKey(name);
  if (!key) return;
  if (!identities.has(key)) identities.set(key, { name, nameCn:row.nameCn || row.cname || '', eras:[], draftYears:[] });
  const identity = identities.get(key);
  if (meta.era && !identity.eras.includes(meta.era)) identity.eras.push(meta.era);
  if (meta.draftYear && !identity.draftYears.includes(meta.draftYear)) identity.draftYears.push(meta.draftYear);
}
Object.entries(complete || {}).forEach(([era, teams]) => Object.values(teams || {}).forEach(roster => (roster || []).forEach(row => remember(row, { era }))));
Object.entries(eraData && eraData.draftClasses || {}).forEach(([year, rows]) => (rows || []).forEach(row => remember(row, { draftYear:year })));

const hupu = scanFiles('assets/images/Player/hupu-era');
const historical = scanFiles('assets/images/Player/historical-nba');
const legacy = scanFiles('assets/data/historical/headshots');
const official = scanFiles('assets/images/Player/nba-official');
const badHupu = invalidHashes(hupu, 2, 4096);
const badLegacy = invalidHashes(legacy, 5, 4096);
const badOfficial = invalidHashes(official, 2, 4096);

const recordsByEnglish = new Map();
const recordsByExactAlias = new Map();
const recordsByChinese = new Map();
const ambiguousRecords = new Set();
const ambiguousAliases = new Set();
const ambiguousChinese = new Set();
const seenRecords = new Set();
Object.entries(upstream.lookup).forEach(([lookupName, record]) => {
  if (!record || !record.e) return;
  const fingerprint = [record.e, record.b || '', record.p || ''].join('|');
  const aliasKey = exactTextKey(lookupName);
  if (aliasKey) {
    const previousAlias = recordsByExactAlias.get(aliasKey);
    if (previousAlias && [previousAlias.e, previousAlias.b || '', previousAlias.p || ''].join('|') !== fingerprint) ambiguousAliases.add(aliasKey);
    else recordsByExactAlias.set(aliasKey, record);
  }
  if (!seenRecords.has(fingerprint)) {
    seenRecords.add(fingerprint);
    const key = displayKey(record.e);
    if (key) {
      const previous = recordsByEnglish.get(key);
      if (previous && (previous.b || previous.p) !== (record.b || record.p)) ambiguousRecords.add(key);
      else recordsByEnglish.set(key, record);
    }
    const chineseKey = exactTextKey(record.c);
    if (chineseKey) {
      const previousChinese = recordsByChinese.get(chineseKey);
      if (previousChinese && [previousChinese.e, previousChinese.b || '', previousChinese.p || ''].join('|') !== fingerprint) ambiguousChinese.add(chineseKey);
      else recordsByChinese.set(chineseKey, record);
    }
  }
});
ambiguousRecords.forEach(key => recordsByEnglish.delete(key));
ambiguousAliases.forEach(key => recordsByExactAlias.delete(key));
ambiguousChinese.forEach(key => recordsByChinese.delete(key));

function remoteExtension(record) {
  const clean = String(record && (record.b || record.p) || '').split('?')[0].toLowerCase();
  if (/\.png$/.test(clean)) return '.png';
  if (/\.webp$/.test(clean)) return '.webp';
  if (/\.gif$/.test(clean)) return '.gif';
  return '.jpg';
}
function verifiedHupuRecord(record) {
  if (!record || !record.e) return null;
  const filename = compactName(record.e) + remoteExtension(record);
  const item = hupu.byLowerName.get(filename.toLowerCase());
  if (!item || badHupu.has(item.hash)) return null;
  return { p:`${hupu.relativeDir}/${item.name}`, s:'hupu-era' };
}
function verifiedHupu(name, nameCn) {
  const key = displayKey(name);
  let record = recordsByEnglish.get(key);
  if (!record) record = recordsByExactAlias.get(exactTextKey(name));
  // Chinese recovery only accepts the record's full canonical Chinese name;
  // short surname/nickname lookup aliases are deliberately not considered.
  if (!record && nameCn) record = recordsByChinese.get(exactTextKey(nameCn));
  // An exact lookup alias is still unsafe if the upstream canonical record
  // collapses a father/son suffix (for example Jr. onto the father's name).
  if (record && generationSuffix(name) !== generationSuffix(record.e)) return null;
  return verifiedHupuRecord(record);
}
const hupuByFilenameIdentity = new Map();
const ambiguousHupuFilenames = new Set();
hupu.byLowerName.forEach(item => {
  if (badHupu.has(item.hash)) return;
  const key = displayKey(item.name.replace(/\.[^.]+$/, ''));
  if (!key) return;
  if (hupuByFilenameIdentity.has(key)) ambiguousHupuFilenames.add(key);
  else hupuByFilenameIdentity.set(key, item);
});
ambiguousHupuFilenames.forEach(key => hupuByFilenameIdentity.delete(key));
function verifiedHupuFilename(name) {
  const item = hupuByFilenameIdentity.get(displayKey(name));
  return item ? { p:`${hupu.relativeDir}/${item.name}`, s:'hupu-era' } : null;
}
function verifiedPresentation(key) {
  const record = presentation && presentation.players && presentation.players[key];
  const relative = record && record.p;
  if (!relative || !relative.startsWith(`${hupu.relativeDir}/`)) return null;
  const filename = relative.slice(hupu.relativeDir.length + 1);
  const item = hupu.byLowerName.get(filename.toLowerCase());
  if (!item || badHupu.has(item.hash)) return null;
  return { p:`${hupu.relativeDir}/${item.name}`, s:'hupu-era' };
}
function fileKey(filename) {
  return displayKey(filename.replace(/\.[^.]+$/, '').replace(/^local-/, ''));
}
function buildNamedIndex(scan, invalid) {
  const result = new Map();
  scan.byLowerName.forEach(item => {
    if (invalid.has(item.hash) || /^draft-/.test(item.name)) return;
    const key = fileKey(item.name);
    if (key && !result.has(key)) result.set(key, item);
  });
  return result;
}
const historicalByName = buildNamedIndex(historical, new Set());
const legacyByName = buildNamedIndex(legacy, badLegacy);
const players = {};
const sourceCounts = { 'hupu-era':0, 'historical-nba':0, 'historical-headshots':0 };
identities.forEach((identity, key) => {
  let resolved = verifiedHupu(identity.name, identity.nameCn);
  if (!resolved) resolved = verifiedHupuFilename(identity.name);
  if (!resolved) resolved = verifiedPresentation(key);
  if (!resolved) {
    const item = historicalByName.get(key);
    if (item) resolved = { p:`${historical.relativeDir}/${item.name}`, s:'historical-nba' };
  }
  if (!resolved) {
    const item = legacyByName.get(key);
    if (item) resolved = { p:`${legacy.relativeDir}/${item.name}`, s:'historical-headshots' };
  }
  if (resolved) {
    players[key] = resolved;
    sourceCounts[resolved.s] += 1;
  }
});

const validOfficialIds = [];
const excludedOfficialIds = [];
official.byLowerName.forEach(item => {
  if (!/^\d+\.png$/i.test(item.name)) return;
  const id = Number(item.name.replace(/\.png$/i, ''));
  if (badOfficial.has(item.hash)) excludedOfficialIds.push(id);
  else validOfficialIds.push(id);
});
validOfficialIds.sort((a, b) => a - b);
excludedOfficialIds.sort((a, b) => a - b);
const validOfficialSet = new Set(validOfficialIds.map(String));
const excludedOfficialSet = new Set(excludedOfficialIds.map(String));
const officialCandidates = new Map();
Object.entries(officialNames).forEach(([name, rawId]) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0 || excludedOfficialSet.has(String(id)) || !validOfficialSet.has(String(id))) return;
  officialLookupKeys(name).forEach(key => {
    if (!officialCandidates.has(key)) officialCandidates.set(key, new Set());
    officialCandidates.get(key).add(id);
  });
});
const verifiedOfficialByName = {};
identities.forEach((identity, key) => {
  const ids = officialCandidates.get(key);
  if (ids && ids.size === 1) verifiedOfficialByName[key] = [...ids][0];
});
const excludedHupuFiles = [...hupu.hashes.values()].filter(group => badHupu.has(group[0].hash)).flat().map(item => item.name).sort();
const payload = {
  version:'20260827-era-headshots-v2',
  source:'dhsa33/perfect-player Hupu photos plus unique-name NBA_PLAYER_IMAGES IDs verified against local non-placeholder official assets',
  upstreamAssetCount:hupu.files.length,
  upstreamAssetBytes:hupu.files.reduce((sum, name) => sum + fs.statSync(path.join(root, hupu.relativeDir, name)).size, 0),
  auditedRealPlayers:identities.size,
  mappedRealPlayers:Object.keys(players).length,
  sourceCounts,
  excludedHupuFiles,
  validOfficialIds,
  excludedOfficialIds,
  verifiedOfficialByName,
  players
};
const code = '// Generated by tools/generate-era-headshot-index.mjs; identity keys preserve Jr./Sr./II/III/IV.\n' +
  'window.__PP_ERA_HEADSHOT_INDEX__=' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.resolve(outputPath), code, 'utf8');
console.log(JSON.stringify({
  version:payload.version,
  auditedRealPlayers:payload.auditedRealPlayers,
  mappedRealPlayers:payload.mappedRealPlayers,
  sourceCounts,
  validOfficialIds:validOfficialIds.length,
  excludedOfficialIds:excludedOfficialIds.length,
  verifiedOfficialNames:Object.keys(verifiedOfficialByName).length,
  excludedHupuFiles,
  upstreamAssetCount:payload.upstreamAssetCount,
  upstreamAssetBytes:payload.upstreamAssetBytes
}, null, 2));
