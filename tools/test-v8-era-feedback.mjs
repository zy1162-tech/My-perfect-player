import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const era = await readFile(new URL('../assets/js/perfect-player-era-mode.js', import.meta.url), 'utf8');
const legacySource = await readFile(new URL('../assets/js/perfect-player-enhancements.js', import.meta.url), 'utf8');
const injurySource = await readFile(new URL('../assets/js/perfect-player-hupu-extensions.js', import.meta.url), 'utf8');
const authoritySource = await readFile(new URL('../assets/js/perfect-player-mod-v4.js', import.meta.url), 'utf8');

const growthFnSource = core.match(/function getEraPlayerGrowthBonus\([\s\S]*?\n\}/)?.[0];
assert.ok(growthFnSource, 'era growth function should be independently testable');
const growthContext = { window:{} };
vm.createContext(growthContext);
vm.runInContext(`${growthFnSource}; window.growth = getEraPlayerGrowthBonus;`, growthContext);
let lebronOvr = 80;
for (let age = 19; age < 24; age++) {
  const player = { _eraRoster:true, _peakOvr:99, ovr:lebronOvr };
  const growth = growthContext.window.growth(player, age, 0.5);
  lebronOvr = Math.min(99, Math.round((lebronOvr + growth) * 2) / 2);
}
assert.ok(lebronOvr >= 89, `five-year historical growth should be visible, got ${lebronOvr}`);
assert.equal(growthContext.window.growth({ _eraRoster:true, _peakOvr:90, ovr:90 }, 22, 1), 0);
assert.equal(growthContext.window.growth({ _eraRoster:false, _peakOvr:99, ovr:70 }, 20, 1), 0);

for (const id of ['clutch','rim_runner','floor_general','glass_cleaner','leader','prodigy']) {
  const line = legacySource.split('\n').find(value => value.includes(`id: '${id}'`));
  assert.ok(line && /max:\s*5/.test(line), `${id} should support Lv.5`);
}
assert.match(legacySource, /LEGACY_SCHEMA_VERSION = 4/);
assert.match(legacySource, /满级约 \+2\.5/);
assert.match(injurySource, /acl_season_ending/);
assert.match(injurySource, /min:82, max:82, major:true, seasonEnding:true/);
assert.match(authoritySource, /Number\(STATE\.finalOVR \|\| 0\) >= 90 \|\| Number\(profile\.leadership \|\| 0\) >= 12/);
assert.match(core, /delete STATE\._legendLeagueApplied/);
assert.match(era, /photoSource = 'era-generated-rookie'/);
assert.match(era, /HISTORICAL_CN_NAMES/);

console.log(`V8 feedback checks passed: LeBron five-year minimum curve ${lebronOvr}, era-safe rookies, Lv.5 legacy, season-ending injury and roster authority.`);
