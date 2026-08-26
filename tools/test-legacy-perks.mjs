import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [source, coreSource, liveSource] = await Promise.all([
  readFile(new URL('../assets/js/perfect-player-enhancements.js', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/perfect-player-live-sim.js', import.meta.url), 'utf8')
]);
const perksStart = source.indexOf('var LEGACY_PERKS = [');
const perksEnd = source.indexOf('PP_FX.LEGACY_PERKS = LEGACY_PERKS;', perksStart);
const storageStart = source.indexOf('function saveLegacy(', perksEnd);
const storageEnd = source.indexOf('var legacy = loadLegacy();', storageStart);
const attrStart = source.indexOf('function legacyAttrBonuses(', storageEnd);
const attrEnd = source.indexOf('PP_FX.legacyAttrBonuses = legacyAttrBonuses;', attrStart);
const fxStart = source.indexOf('PP_FX.getLegacySimulationEffects = function(player)', attrEnd);
const fxEnd = source.indexOf('\n  };', fxStart) + '\n  };'.length;
assert.ok(perksStart >= 0 && perksEnd > perksStart, 'legacy perk definitions should be present');
assert.ok(storageStart >= 0 && storageEnd > storageStart, 'legacy migration should be present');
assert.ok(attrStart >= 0 && attrEnd > attrStart, 'legacy attribute calculator should be present');
assert.ok(fxStart >= 0 && fxEnd > fxStart, 'legacy simulation effects should be present');

let stored = JSON.stringify({
  version:4,
  levels:{ playmaker:5, athlete:5, floor_general:5, glass_cleaner:5 },
  spent:999
});
const ctx = {
  Math,
  JSON,
  LEGACY_SCHEMA_VERSION:5,
  PP_FX:{},
  localStorage:{
    getItem:key => key === 'pp_legacy_v1' ? stored : null,
    setItem:(key, value) => { if (key === 'pp_legacy_v1') stored = value; }
  }
};
vm.createContext(ctx);
vm.runInContext(
  source.slice(perksStart, perksEnd) +
  '\nvar PERK_MAP = {}; LEGACY_PERKS.forEach(function(p) { PERK_MAP[p.id] = p; });' +
  '\nvar LEGACY_KEY = "pp_legacy_v1";' +
  '\n' + source.slice(storageStart, storageEnd),
  ctx
);

const migrated = ctx.loadLegacy();
assert.equal(migrated.version, 5);
assert.equal(migrated.levels.floor_general, 5, 'old floor_general level should survive migration');
assert.equal(migrated.levels.glass_cleaner, 5, 'old glass_cleaner level should survive migration');

ctx.legacy = migrated;
vm.runInContext(source.slice(attrStart, attrEnd) + '\n' + source.slice(fxStart, fxEnd), ctx);
const bonuses = ctx.legacyAttrBonuses();
assert.equal(bonuses.HAN, 5, 'only playmaker should add HAN');
assert.equal(bonuses.PAS, 5, 'only playmaker should add PAS');
assert.equal(bonuses.REB, 5, 'only athlete should add REB');
const effects = ctx.PP_FX.getLegacySimulationEffects({ _isUser:true });
assert.equal(effects.assistWeight, 1.15);
assert.equal(effects.turnoverRisk, 0.9);
assert.equal(effects.reboundWeight, 1.25);
const teammateEffects = ctx.PP_FX.getLegacySimulationEffects({ _isUser:false });
assert.equal(teammateEffects.assistWeight, 1);
assert.equal(teammateEffects.turnoverRisk, 1);
assert.equal(teammateEffects.reboundWeight, 1);
assert.match(coreSource, /getLegacySimulationEffects\(profile\.player\)\.assistWeight/, 'skip simulation should apply assist weight');
assert.match(coreSource, /getLegacySimulationEffects\(profile\.player\)\.turnoverRisk/, 'skip simulation should apply turnover risk');
assert.match(coreSource, /getLegacySimulationEffects\(profile\.player\)\.reboundWeight/, 'skip simulation should apply rebound weight');
assert.match(liveSource, /legacyFxOf\(p\)\.reboundWeight/, 'watch simulation should apply rebound contest weight');
assert.match(liveSource, /legacyFxOf\(p\)\.assistWeight/, 'watch simulation should apply assist creation weight');
assert.match(liveSource, /legacyTurnoverProtection/, 'watch simulation should apply turnover protection');

console.log('Legacy perk checks passed: old levels retained, no duplicate base attributes, simulation effects active.');
