import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const live = await readFile(new URL('../assets/js/perfect-player-live-sim.js', import.meta.url), 'utf8');
const helperStart = live.indexOf('function isOffenseHome(');
const helperEnd = live.indexOf('function buildCtx(', helperStart);
const buildEnd = live.indexOf('function applyOutcome(', helperEnd);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'production home-context helper should be present');
assert.ok(buildEnd > helperEnd, 'production buildCtx source should be present');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(live.slice(helperStart, helperEnd), ctx);
assert.equal(ctx.isOffenseHome(true, 'A'), true, 'team A offense should be home when team A hosts');
assert.equal(ctx.isOffenseHome(true, 'B'), false, 'team B offense should be road when team A hosts');
assert.equal(ctx.isOffenseHome(false, 'A'), false, 'team A offense should be road when team B hosts');
assert.equal(ctx.isOffenseHome(false, 'B'), true, 'team B offense should be home when team B hosts');

const buildCtxSource = live.slice(helperEnd, buildEnd);
assert.match(buildCtxSource, /home:\s*isOffenseHome\(bp\.teamAHome, side\)/, 'production possession context should call the symmetric helper');
assert.doesNotMatch(buildCtxSource, /home:\s*bp\.teamAHome\s*&&\s*side\s*===\s*['"]A['"]/, 'one-sided home expression must not return');

console.log('Live home-context checks passed: A/B offenses receive symmetric home status.');
