import assert from 'node:assert/strict';
import { createSimulation, runBaseline, summarize } from './bench-era-baseline.mjs';

assert.deepEqual(summarize([0, 10, 20]), { n:3, mean:10, p10:2, p50:10, p90:18 });
const hostRandom = Math.random;
const options = { gamesPerEra:870, growthTrials:2, seed:12345 };
const first = runBaseline(options);
assert.deepEqual(runBaseline(options), first, 'same seed must reproduce all four-era distributions');
assert.equal(Math.random, hostRandom, 'production RNG must remain isolated inside the VM');
for (const era of Object.values(first.eras)) {
  const appearances = Object.values(era.teamAppearances);
  assert.equal(appearances.reduce((a,b) => a+b,0), options.gamesPerEra * 2);
  assert.ok(appearances.every(n => n >= 2 * (appearances.length - 1)), 'the sample must include a complete home-and-away cycle for every opponent');
  if (appearances.length === 30) assert.ok(appearances.every(n => n === 58));
  assert.equal(era.teams.pts.n, 1740);
  assert.ok(era.teams.pts.p10 < era.teams.pts.p90, 'production game randomness must be exercised');
  assert.ok(era.roles.primary.mins.mean > era.roles.bench.mins.mean);
  assert.equal(era.roles.inactive.fga.mean, 0);
  assert.ok(era.growth['18-22'].ovrChange.n > 0);
  assert.ok(Object.keys(era.retirementAges).length >= 3);
}
const a = createSimulation(2010, 1), b = createSimulation(2010, 2);
assert.notDeepEqual(
  a.context.simulate82StyleMatchup('ATL', 'BOS', { includeBoxScore:false, neutralState:true }),
  b.context.simulate82StyleMatchup('ATL', 'BOS', { includeBoxScore:false, neutralState:true }),
  'different seeds must change real matchup outcomes'
);
console.log('Four-era production baseline passed: deterministic samples, balanced pairings, RNG isolation, box conservation and growth/retirement coverage.');
