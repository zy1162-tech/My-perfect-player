import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const era = await readFile(new URL('../assets/js/perfect-player-era-mode.js', import.meta.url), 'utf8');
const legacySource = await readFile(new URL('../assets/js/perfect-player-enhancements.js', import.meta.url), 'utf8');
const injurySource = await readFile(new URL('../assets/js/perfect-player-hupu-extensions.js', import.meta.url), 'utf8');
const authoritySource = await readFile(new URL('../assets/js/perfect-player-mod-v4.js', import.meta.url), 'utf8');

const growthFnSource = core.match(/function getEraPlayerGrowthBonus\([\s\S]*?\n\}/)?.[0];
const primeFnSource = core.match(/function getEraPlayerPrimeFloor\([\s\S]*?\n\}/)?.[0];
const averageFnSource = core.match(/function averageCareerAttributes\([\s\S]*?\n\}/)?.[0];
const profileSeedFnSource = core.match(/function careerProfileSeed\([\s\S]*?\n\}/)?.[0];
const profileFnSource = core.match(/function ensureLeagueCareerProfile\([\s\S]*?\n\}/)?.[0];
const ageFactorFnSource = core.match(/function getLeagueAgeDevelopmentFactor\([\s\S]*?\n\}/)?.[0];
assert.ok(growthFnSource, 'era growth function should be independently testable');
assert.ok(primeFnSource, 'historical prime-window function should be independently testable');
assert.ok(averageFnSource && profileSeedFnSource && profileFnSource, 'career-profile functions should be independently testable');
assert.ok(ageFactorFnSource, 'general rookie-prime-decline lifecycle should be independently testable');
const growthContext = { window:{} };
vm.createContext(growthContext);
vm.runInContext(`${averageFnSource};${growthFnSource};${primeFnSource};${profileSeedFnSource};${profileFnSource};${ageFactorFnSource}; window.growth = getEraPlayerGrowthBonus; window.primeFloor = getEraPlayerPrimeFloor; window.ageFactor = getLeagueAgeDevelopmentFactor;`, growthContext);
let lebronOvr = 80;
for (let age = 19; age < 24; age++) {
  const player = { _eraRoster:true, _peakOvr:99, ovr:lebronOvr };
  const growth = growthContext.window.growth(player, age, 0.5);
  lebronOvr = Math.min(99, Math.round((lebronOvr + growth) * 2) / 2);
}
assert.ok(lebronOvr >= 89, `five-year historical growth should be visible, got ${lebronOvr}`);
assert.equal(growthContext.window.growth({ _eraRoster:true, _peakOvr:90, ovr:90 }, 22, 1), 0);
assert.equal(growthContext.window.growth({ _eraRoster:false, _peakOvr:99, ovr:70 }, 20, 1), 0);
const lebronCurve = { _eraRoster:true, _primeStartAge:23, _primeEndAge:41, _primeFloorOvr:94 };
assert.equal(growthContext.window.primeFloor(lebronCurve, 30), 94, 'LeBron should remain in his historical prime at age 30');
assert.equal(growthContext.window.primeFloor(lebronCurve, 41), 94, 'LeBron should retain a 90+ floor through the 2025-26 historical window');
assert.equal(growthContext.window.primeFloor(lebronCurve, 42), 0, 'normal late-career decline may begin after the historical window');
assert.ok(growthContext.window.ageFactor({}, 20, 0) > 0, 'rookies should grow');
assert.ok(Math.abs(growthContext.window.ageFactor({}, 27, 0)) <= 0.25, 'age 26-29 should be a stable prime, not premature decline');
assert.ok(growthContext.window.ageFactor({}, 31, 0.5) < 0, 'normal decline should begin after age 30');
assert.ok(growthContext.window.ageFactor({}, 36, 0.5) < growthContext.window.ageFactor({}, 31, 0.5), 'late-career decline should accelerate');

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
assert.match(era, /'chris webber':\{ peak:94, primeStart:25, primeEnd:31, primeFloor:90 \}/);

console.log(`V9 feedback checks passed: LeBron grows to ${lebronOvr} then holds 94+ through age 41; Webber peak and star prime windows are calibrated.`);
