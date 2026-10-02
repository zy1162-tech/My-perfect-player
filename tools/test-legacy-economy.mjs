import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('assets/js/perfect-player-enhancements.js','utf8');
const a0 = source.indexOf('var ACHIEVEMENTS = [');
const a1 = source.indexOf('var ACH_MAP = {};', a0);
const p0 = source.indexOf('var LEGACY_PERKS = [');
const p1 = source.indexOf('PP_FX.LEGACY_PERKS = LEGACY_PERKS;', p0) + 'PP_FX.LEGACY_PERKS = LEGACY_PERKS;'.length;
assert.ok(a0>=0&&a1>a0&&p0>=0&&p1>p0);
const ctx = {PP_FX:{}};
vm.createContext(ctx);
vm.runInContext(source.slice(a0,a1),ctx);
vm.runInContext(source.slice(p0,p1),ctx);
const ids = ctx.ACHIEVEMENTS.map(a=>a.id);
const rewardIds = Object.keys(ctx.ACHIEVEMENT_LP_REWARDS);
assert.equal(ids.length,29);
assert.deepEqual(new Set(rewardIds),new Set(ids));
assert.equal(Object.values(ctx.ACHIEVEMENT_LP_REWARDS).reduce((s,x)=>s+x,0),150);
assert.equal(ctx.LEGACY_PERKS.length,10);
for (const perk of ctx.LEGACY_PERKS) assert.deepEqual(Array.from(perk.costs),[1,2,3,4,5]);
assert.equal(ctx.LEGACY_PERKS.reduce((s,p)=>s+p.costs.reduce((a,b)=>a+b,0),0),150);
assert.match(source,/var STARTING_LEGACY_LP = 30;/);
assert.match(source,/function archiveLP\(\) \{\s*return 0;/);
assert.match(source,/legacy\.spent = legacySpentForLevels\(legacy\.levels\);/);
assert.match(source,/if \(unlocked\[id\]\)[\s\S]*?return false;/, 'repeat unlock remains idempotent');

const unlockCtx = {PP_FX:{_suppressAchievementPopups:true},ACH_MAP:Object.fromEntries(ctx.ACHIEVEMENTS.map(a=>[a.id,a])),unlocked:{},
  saveUnlocked(){},showUnlockPopup(){throw new Error('popup should stay suppressed');},setTimeout(fn){fn();}};
unlockCtx.unlockedCount = function(){ return Object.keys(unlockCtx.unlocked).filter(k=>unlockCtx.ACH_MAP[k]).length; };
vm.createContext(unlockCtx);
const u0=source.indexOf('PP_FX.unlock = function (id, evidence)'), u1=source.indexOf('// Deterministic reconciliation',u0);
vm.runInContext(source.slice(u0,u1),unlockCtx);
assert.equal(unlockCtx.PP_FX.unlock('champion'),true);
assert.equal(unlockCtx.PP_FX.unlock('champion'),false);
assert.equal(unlockCtx.unlockedCount(),1,'repeat unlock cannot create another reward claim');

let stored = JSON.stringify({version:5,levels:{scorer:5,prodigy:5,floor_general:4},spent:999});
const migrate = {Math,JSON,LEGACY_SCHEMA_VERSION:6,LEGACY_KEY:'pp_legacy_v1',LEGACY_PERKS:ctx.LEGACY_PERKS,
  localStorage:{getItem:()=>stored,setItem:(k,v)=>{stored=v;}}};
vm.createContext(migrate);
const s0=source.indexOf('function saveLegacy(',p1), s1=source.indexOf('function achievementLP()',s0);
vm.runInContext(source.slice(s0,s1),migrate);
assert.equal(migrate.legacy.version,6);
assert.deepEqual(JSON.parse(JSON.stringify(migrate.legacy.levels)),{scorer:5,prodigy:5,floor_general:4});
assert.equal(migrate.legacy.spent,40, 'new costs are recomputed without level loss');
const lpCtx={unlocked:{champion:{}},ACH_MAP:Object.fromEntries(ctx.ACHIEVEMENTS.map(a=>[a.id,a])),ACHIEVEMENT_LP_REWARDS:ctx.ACHIEVEMENT_LP_REWARDS,
  STARTING_LEGACY_LP:30,legacy:{spent:999},ACHIEVEMENTS:ctx.ACHIEVEMENTS,CAREER_ARCHIVE_CACHE:[{},{},{}]};
vm.createContext(lpCtx);
const l0=source.indexOf('function achievementLP()'), l1=source.indexOf('PP_FX.totalLP',l0);
vm.runInContext(source.slice(l0,l1),lpCtx);
assert.equal(lpCtx.achievementLP(),7);
assert.equal(lpCtx.archiveLP(),0);
assert.equal(lpCtx.availableLP(),0,'overspent legacy keeps levels and exposes zero available points');
console.log('✓ legacy economy: 29 achievements / 150 pool / 30 initial / 150 tree / archive 0');
