import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('assets/js/perfect-player-core.js');
const eraMode = read('assets/js/perfect-player-era-mode.js');
const html = read('nba-perfect-player.html');
const sw = read('sw.js');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing production function ${name}`);
  const tail = source.slice(start);
  const match = tail.match(new RegExp(`^function ${name}\\([\\s\\S]*?^\\}`, 'm'));
  assert.ok(match, `could not extract production function ${name}`);
  return match[0];
}

function seededMath(seed) {
  const math = Object.create(Math);
  let state = seed >>> 0;
  math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return math;
}

const functionNames = [
  'isHistoricalBuildActive',
  'getBuildSpinTeams',
  'getBuildPlayerPool',
  'getBuildHistoricalSurprisePool',
  'getBuildPlayerIdentity',
  'uniqueBuildPlayers',
  'getMixedTeamHallOfFameShare',
  'pickBuildSurprise',
  'drawBuildPlayers',
  'shuffleArr'
];
const production = [
  'const HISTORICAL_SURPRISE_DRAW_CHANCE = 0.20;',
  'const HISTORICAL_HALL_OF_FAME_SHARE = 0.25;',
  ...functionNames.map(name => extractFunction(core, name)),
  'this.API = { isHistoricalBuildActive, getBuildSpinTeams, getBuildPlayerPool, getBuildPlayerIdentity, getMixedTeamHallOfFameShare, pickBuildSurprise, drawBuildPlayers };'
].join('\n\n');

const normal = Array.from({ length: 12 }, (_, index) => ({
  name:index === 0 ? 'Era Star' : `Rotation Player ${index}`,
  cname:index === 0 ? '时代球星' : `轮换球员${index}`,
  ovr:68 + index,
  _sourceKind:'current'
}));
const historical = [
  { name:'Era Star', cname:'时代球星巅峰', _sourceKind:'historical', _historicalTier:'modern-all-star' },
  { name:'Modern Surprise 2', cname:'全明星惊喜2', _sourceKind:'historical', _historicalTier:'modern-all-star' },
  { name:'Modern Surprise 3', cname:'全明星惊喜3', _sourceKind:'historical', _historicalTier:'modern-all-star' },
  { name:'Modern Surprise 4', cname:'全明星惊喜4', _sourceKind:'historical', _historicalTier:'modern-all-star' },
  { name:'Epic Surprise 1', cname:'史诗惊喜1', _sourceKind:'historical', _historicalTier:'hall-of-fame' },
  { name:'Epic Surprise 2', cname:'史诗惊喜2', _sourceKind:'historical', _historicalTier:'hall-of-fame' },
  { name:'Epic Surprise 3', cname:'史诗惊喜3', _sourceKind:'historical', _historicalTier:'hall-of-fame' }
];
const context = {
  console,
  Math:seededMath(0x2badb002),
  STATE:{ mode:'legend', eraStart:2003, _legendLeagueApplied:2003 },
  NBA2K_TEAMS:['AAA', 'BBB'],
  NBA2K_DATA:{ AAA:normal, BBB:[{ name:'Era Bench', cname:'年代替补' }] },
  window:{
    PERFECT_PLAYER_BUILD_DATA:{ AAA:[{ name:'Current Only' }], BBB:[] },
    PERFECT_PLAYER_HISTORICAL_SURPRISE_DATA:{ AAA:historical },
    PP_ERA_MODE:{ isHistoricalActive:() => true, getSpinTeams:() => ['AAA', 'BBB'] }
  }
};
vm.createContext(context);
vm.runInContext(production, context, { filename:'build-roll-production-functions.js' });
const api = context.API;

assert.equal(api.getBuildPlayerPool('AAA'), normal, 'legend build must read the applied era NBA2K_DATA roster');
assert.deepEqual(Array.from(api.getBuildSpinTeams()), ['AAA', 'BBB'], 'legend spinner must use era teams with usable rosters');
context.STATE.mode = 'current';
context.window.PP_ERA_MODE.isHistoricalActive = () => false;
assert.equal(api.getBuildPlayerPool('AAA'), context.window.PERFECT_PLAYER_BUILD_DATA.AAA, 'current mode must keep the current build pool');
assert.deepEqual(Array.from(api.getBuildSpinTeams()), ['AAA'], 'current spinner must exclude teams missing a current build pool');
context.STATE.mode = 'legend';
context.window.PP_ERA_MODE.isHistoricalActive = () => true;

assert.equal(api.getBuildPlayerIdentity({ nameEn:'Nikola Jokic', cname:'约基奇' }), api.getBuildPlayerIdentity({ name:'Nikola Jokić', cname:'尼古拉' }), 'English normalized identity should take priority');
assert.equal(api.getBuildPlayerIdentity({ name:'姚 明' }), api.getBuildPlayerIdentity({ cname:'姚明' }), 'Chinese name should be the fallback identity');

const rounds = 100000;
let specialRounds = 0;
let hallOfFame = 0;
let modernAllStar = 0;
let normalCards = 0;
for (let round = 0; round < rounds; round += 1) {
  const cards = api.drawBuildPlayers(normal, 5, 'AAA');
  assert.equal(cards.length, 5, 'a full normal pool should always yield five cards');
  const identities = cards.map(api.getBuildPlayerIdentity);
  assert.equal(new Set(identities).size, cards.length, 'one round must not contain duplicate player identities');
  const specials = cards.filter(card => card._sourceKind === 'historical');
  assert.ok(specials.length <= 1, 'one round may contain at most one special card');
  normalCards += cards.length - specials.length;
  if (specials.length) {
    specialRounds += 1;
    if (specials[0]._historicalTier === 'hall-of-fame') hallOfFame += 1;
    else if (specials[0]._historicalTier === 'modern-all-star') modernAllStar += 1;
    else assert.fail('special card must come from an explicit tier');
  }
}

const specialRate = specialRounds / rounds;
const hofShare = hallOfFame / specialRounds;
const normalShare = normalCards / (rounds * 5);
assert.ok(specialRate > 0.19 && specialRate < 0.21, `special insertion rate ${specialRate.toFixed(4)} should be near 20%`);
assert.ok(hofShare > 0.23 && hofShare < 0.27, `HOF share ${hofShare.toFixed(4)} should be near 25%`);
assert.ok(modernAllStar > hallOfFame, 'modern all-star surprises should be the clear majority of specials');
assert.ok(normalShare > 0.95, `normal cards must dominate all displayed cards, got ${normalShare.toFixed(4)}`);
assert.ok(specialRounds < rounds, 'legend mode must never revert to a 100% historical pool');

context.window.PERFECT_PLAYER_HISTORICAL_SURPRISE_DATA.AAA = historical.filter(card => card._historicalTier === 'modern-all-star');
for (let index = 0; index < 100; index += 1) {
  assert.equal(api.pickBuildSurprise('AAA')._historicalTier, 'modern-all-star', 'an empty requested tier must fall back to the available tier');
}

// 使用真实本地 30 队特殊池的层级构成，验证单层回退后的联盟整体校准，而非只测混合合成池。
const poolWindow = {};
vm.runInNewContext(read('assets/data/perfect-player-pool-local.js'), { window:poolWindow });
const realSourceTeams = Object.values(poolWindow.PERFECT_PLAYER_POOL_DATA.teams || {});
assert.equal(realSourceTeams.length, 30, 'real local pool must contain 30 teams');
const realTeamKeys = realSourceTeams.map((_, index) => `REAL_${index + 1}`);
const realSpecialPools = {};
const realNormalPools = {};
realSourceTeams.forEach((sourceTeam, index) => {
  const team = realTeamKeys[index];
  realNormalPools[team] = Array.from({ length:5 }, (_, playerIndex) => ({ name:`${team} Normal ${playerIndex}` }));
  realSpecialPools[team] = (sourceTeam.historicalPlayers || []).map(player => ({
    name:player.nameEn || player.altName || player.name,
    cname:player.nameCn || player.name,
    _sourceKind:'historical',
    _historicalTier:player.historicalTier
  }));
});
context.NBA2K_TEAMS = realTeamKeys;
context.NBA2K_DATA = realNormalPools;
context.window.PERFECT_PLAYER_HISTORICAL_SURPRISE_DATA = realSpecialPools;
context.window.PP_ERA_MODE.getSpinTeams = () => realTeamKeys;

const singleTierTeams = realTeamKeys.filter(team => {
  const tiers = new Set(realSpecialPools[team].map(card => card._historicalTier));
  return tiers.size === 1;
});
assert.equal(singleTierTeams.length, 7, 'real pool fixture should expose the known seven single-tier teams');
assert.equal(singleTierTeams.filter(team => realSpecialPools[team][0]._historicalTier === 'hall-of-fame').length, 4, 'real pool should contain four HOF-only teams');
assert.equal(singleTierTeams.filter(team => realSpecialPools[team][0]._historicalTier === 'modern-all-star').length, 3, 'real pool should contain three modern-only teams');
for (const team of singleTierTeams) {
  const availableTier = realSpecialPools[team][0]._historicalTier;
  for (let sample = 0; sample < 50; sample += 1) {
    const surprise = api.pickBuildSurprise(team);
    assert.ok(surprise, `single-tier team ${team} must still produce a special card`);
    assert.equal(surprise._historicalTier, availableTier, `single-tier team ${team} must fall back to its available tier`);
    assert.ok(realSpecialPools[team].includes(surprise), 'a surprise must remain on the selected team');
  }
}

const mixedShare = api.getMixedTeamHallOfFameShare();
assert.ok(mixedShare > 0.14 && mixedShare < 0.17, `real mixed-team calibration ${mixedShare.toFixed(4)} should offset four HOF-only teams`);
const realSpecialSamples = 120000;
let realHallOfFame = 0;
for (let sample = 0; sample < realSpecialSamples; sample += 1) {
  const team = realTeamKeys[sample % realTeamKeys.length];
  const surprise = api.pickBuildSurprise(team);
  assert.ok(surprise, `real team ${team} must not yield an empty special draw`);
  assert.ok(realSpecialPools[team].includes(surprise), 'real special draw must belong to the requested team');
  if (surprise._historicalTier === 'hall-of-fame') realHallOfFame += 1;
}
const realHofShare = realHallOfFame / realSpecialSamples;
assert.ok(realHofShare > 0.24 && realHofShare < 0.26, `real 30-team HOF share ${realHofShare.toFixed(4)} should be near 25%`);

const begin = extractFunction(core, 'beginAttributeBuild');
const buildContext = {
  STATE:{ mode:'legend', eraStart:2010, attrs:{}, attrSlots:{} },
  window:{ PP_ERA_MODE:{ apply() { buildContext.order.push('apply'); buildContext.STATE._legendLeagueApplied = 2010; } } },
  ATTR_KEYS:[], clearTimeout() {}, showScreen() { buildContext.order.push('screen'); },
  renderBuildUI() { buildContext.order.push('ui'); }, renderTeamPicker() { buildContext.order.push('picker'); },
  order:[]
};
vm.createContext(buildContext);
vm.runInContext(`${begin}\nthis.beginAttributeBuild = beginAttributeBuild;`, buildContext);
buildContext.beginAttributeBuild();
assert.deepEqual(buildContext.order, ['apply', 'screen', 'ui', 'picker'], 'era roster must be applied before the build UI and spinner render');
buildContext.order.length = 0;
buildContext.STATE.mode = 'current';
buildContext.beginAttributeBuild();
assert.deepEqual(buildContext.order, ['screen', 'ui', 'picker'], 'current mode must not apply a historical roster');

assert.match(eraMode, /isHistoricalActive:isHistoricalActive/);
assert.match(eraMode, /getSpinTeams:getSpinTeams/);
assert.ok((core.match(/const sorted = getBuildSpinTeams\(\);/g) || []).length >= 2, 'rendering and spinning must share the same team list helper');
assert.doesNotMatch(core, /STATE\.mode === 'legend'\s*&&\s*historical\.length[\s\S]{0,80}return historical/, 'legend mode must not directly return the historical pool');
assert.match(core, /史诗 · 名人堂惊喜/);
assert.match(core, /全明星惊喜/);
assert.match(core, /historicalCard \?[^\n]+: ovrGrade/, 'normal cards should show their OVR grade');
assert.match(html, /perfect-player-core\.js\?v=20260827-new-career-system-reset-v32/);
assert.match(html, /perfect-player-era-mode\.js\?v=20260826-rating-v31/);
assert.match(sw, /perfect-player-core\.js\?v=20260827-new-career-system-reset-v32/);
assert.match(sw, /perfect-player-era-mode\.js\?v=20260826-rating-v31/);
assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ '20260827-new-career-system-reset-v16'/);

console.log(`✓ build roll: ${rounds} seeded rounds, special=${(specialRate * 100).toFixed(2)}%, mixed-fixture HOF=${(hofShare * 100).toFixed(2)}%, real-pool HOF=${(realHofShare * 100).toFixed(2)}%, normal cards=${(normalShare * 100).toFixed(2)}%`);
