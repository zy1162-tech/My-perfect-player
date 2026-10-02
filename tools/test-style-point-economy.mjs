import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const state = { attrs:{ATH:80}, career:{profile:{},flags:{},skills:{points:0,earned:0,purchased:{}}}, season:{playerStats:{games:82,pts:1640,reb:574,ast:328,stl:82,blk:41},awards:[]} };
const ctx = { STATE:state, Math, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/js/perfect-player-skills.js','utf8'), ctx);
const api = ctx.PP_SKILLS;
assert.deepEqual([api.SEASON_POINT_BASE,api.SEASON_POINT_CAP,api.ALL_SEASON_POINT_CAP],[16,26,32]);
const normal = api.computeSeasonStyleGrant();
assert.ok(normal.total >= 20 && normal.total <= 26, `ordinary full season ${normal.total}`);
assert.equal(api.grantStylePoints(10),10);
const settlement = api.grantSeasonStylePoints();
assert.equal(settlement.total,22, 'settlement is clipped by earlier seasonal sources');
assert.equal(state.season._stylePointsEarned,32);
assert.equal(api.grantStylePoints(5),0, 'all later seasonal sources are capped');
assert.match(api.formatGrantLine(settlement),/32 点上限/);
assert.match(api.formatGrantLine(settlement),/结算原可得 23，受单季 32 点上限/,
  'a capped settlement must not display an impossible parts sum as credited points');
assert.equal(api.grantSeasonStylePoints().total,22, 'settlement remains idempotent');

state.career.skills.points = 2000;
const untouched = { attrs:JSON.stringify(state.attrs), retired:state.career.retired, injury:state.career.injury, age:state.career.age };
for (let i=0;i<100;i++) assert.equal(api.buyStyleSkill('endurance_training').ok,true);
const info = api.listStyleSkills().find(s => s.id === 'endurance_training');
const fx = api.getEnduranceTrainingEffects();
assert.equal(info.purchased,100);
assert.equal(info.infinite,true);
assert.ok(api.skillCost(101,'endurance_training') <= 12);
assert.ok(fx.fatigueReduction <= .10 && fx.minuteVarianceReduction <= .08);
assert.deepEqual({ attrs:JSON.stringify(state.attrs), retired:state.career.retired, injury:state.career.injury, age:state.career.age }, untouched,
  'endurance training cannot touch OVR/attrs, injury, aging, or retirement state');
state.career.retired = true;
assert.equal(api.buyStyleSkill('endurance_training').ok,false);

state.career = {profile:{},flags:{},skills:{points:3}};
assert.deepEqual(Object.keys(api.ensureSkillState().purchased),[], 'old skill state lazily initializes purchased map');
assert.doesNotThrow(()=>api.listStyleSkills(), 'opening skill panel data must not loop on infinite max');
console.log('✓ style point economy', {normal:normal.total, seasonal:state.season._stylePointsEarned, endurance:fx});
