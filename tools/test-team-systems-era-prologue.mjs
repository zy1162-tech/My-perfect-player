import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const modSource = read('assets/js/perfect-player-mod-v4.js');
const coreSource = read('assets/js/perfect-player-core.js');
const storySource = read('assets/js/perfect-player-era-story.js');
const html = read('nba-perfect-player.html');
const boot = read('assets/js/perfect-player-boot.js');
const sw = read('sw.js');

const inserted = [];
const nodes = new Map();
const modContext = {
  console,
  window:null,
  STATE:{ careerTeam:'PHX', career:{ seasonCount:0, contract:2, profile:{} }, finalOVR:85, season:{ awards:[] }, _freeAgentPool:[] },
  NBA2K_DATA:{ PHX:[{ name:'A', cname:'甲', pos:'PG', ovr:80, contract:2 }], BOS:[{ name:'B', cname:'乙', pos:'C', ovr:80, contract:2 }] },
  calcTeamLineup:() => ({ starters:{ PG:null }, bench:[] }),
  calcTeamPowerWithPlayer:() => ({ offense:80, defense:80, depth:80 }),
  clearLineupCache:() => {},
  document:{
    getElementById:id => nodes.get(id) || null,
    body:{ insertAdjacentHTML:(_where, value) => inserted.push(value) }
  }
};
modContext.window = modContext;
vm.createContext(modContext);
vm.runInContext(modSource, modContext, { filename:'perfect-player-mod-v4.js' });

assert.equal(Object.keys(modContext.PP_MOD_V4.teamSystems).length, 5);
assert.deepEqual(JSON.parse(JSON.stringify(modContext.getTeamSystemEffects('BOS'))), { name:'均衡体系', icon:'⚖️', desc:'按阵容能力自然分配球权，攻守没有额外偏置。', offense:0, defense:0, pace:0, three:0 });
modContext.chooseTeamSystem('five_out');
assert.equal(modContext.STATE.teamSystems.PHX, 'five_out');
assert.equal(modContext.getTeamSystemEffects('PHX').three, 0.016);
modContext.chooseTeamSystem('not-real');
assert.equal(modContext.STATE.teamSystems.PHX, 'balanced', 'invalid/old save system keys must safely fall back');
let chooserDone = 0;
modContext.showTeamSystemChooser(() => chooserDone++);
assert.match(inserted.at(-1), /七秒进攻/);
assert.match(inserted.at(-1), /双塔阵地/);
modContext.chooseTeamSystem('defense_transition');
assert.equal(chooserDone, 1);
assert.equal(modContext.getTeamSystemEffects('PHX').defense, 1.7);
assert.match(modSource, /processTrades\(\);[\s\S]*global\.showLeagueIntel\(function\(\) \{[\s\S]*global\.showTeamSystemChooser\(function\(\) \{[\s\S]*showRosterAuthority\(function\(\) \{[\s\S]*showRecruitmentMarket/);
assert.match(coreSource, /systemA = typeof getTeamSystemEffects/);
assert.match(coreSource, /systemB = typeof getTeamSystemEffects/);
assert.match(coreSource, /Number\(systemA\.pace\)/);
assert.match(coreSource, /Number\(systemA\.offense\)/);
assert.match(coreSource, /Number\(systemA\.three\)/);
assert.match(coreSource.match(/function initGame\(\)[\s\S]*?\n\}/)[0], /teamSystems:\s*\{\}/, 'new current and legend careers must start without prior team-system choices');
assert.match(coreSource, /Object\.assign\(STATE, snap\.state\)/, 'old saves must restore their own teamSystems through the existing snapshot path');

function storyFixture(era, career, games = []) {
  let shown = null;
  const context = {
    console,
    globalThis:null,
    STATE:{ mode:'legend', eraStart:era, career, season:{ games } },
    STAGED_BRANCH_EVENTS:[],
    showSeasonBranchEvent:event => { shown = event; }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(storySource, context, { filename:'perfect-player-era-story.js' });
  return { context, shown:() => shown };
}

for (const era of [2003, 2010, 2016]) {
  const fixture = storyFixture(era, { seasonCount:0, seasons:[] });
  assert.equal(fixture.context.PP_ERA_STORY.events.filter(event => event._eraStoryYear === era).length, 3);
  assert.equal(fixture.context.PP_ERA_STORY.showPrologueIfDue(), true, `${era} new legend save prologue`);
  const event = fixture.shown();
  assert.equal(event.id, `era_prologue_${era}`);
  assert.match(event.title, new RegExp(String(era)));
  assert.equal(fixture.context.PP_ERA_STORY.showPrologueIfDue(), false, `${era} prologue must not auto-repeat`);
  event.choices[0].apply();
  assert.equal(fixture.context.PP_ERA_STORY.getPrologueStatus().completed, true);
}

const legacy = storyFixture(2010, { seasonCount:2, seasons:[{}] });
assert.equal(legacy.context.PP_ERA_STORY.showPrologueIfDue({ existingSave:true }), false);
assert.deepEqual(JSON.parse(JSON.stringify(legacy.context.PP_ERA_STORY.getPrologueStatus())), { era:2010, seen:true, completed:false, legacySkipped:true });
const current = storyFixture(2016, { seasonCount:0, seasons:[] });
current.context.STATE.mode = 'current';
assert.equal(current.context.PP_ERA_STORY.showPrologueIfDue(), false, 'current career never receives era prologue');

assert.match(coreSource, /id="era-prologue-entry"/);
assert.match(coreSource, /openLegendEraPrologue\(false\)/);
assert.match(html, /perfect-player-core\.js\?v=20260827-new-career-system-reset-v32/);
assert.match(html, /perfect-player-mod-v4\.js\?v=20260827-systems-prologue-v17/);
assert.match(boot, /perfect-player-era-story\.js\?v=20260827-prologue-v3/);
assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ '20260827-local-headshot-attach-v17'/);
assert.match(sw, /perfect-player-era-story\.js\?v=20260827-prologue-v3/);

console.log('✓ team systems + era prologue: 5 systems, production simulation wiring, offseason order, 3 one-shot prologues, legacy-safe initialization');
