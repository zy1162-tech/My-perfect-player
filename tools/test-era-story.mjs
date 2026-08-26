import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storySrc = fs.readFileSync(path.join(root, 'assets/js/perfect-player-era-story.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(root, 'assets/js/perfect-player-core.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'assets/js/perfect-player-boot.js'), 'utf8');

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`
  var STAGED_BRANCH_EVENTS = [];
  var STATE = {
    mode:'legend', eraStart:2003,
    attrs:{FIN:70,PAS:70,PDEF:70,threePT:70,STR:70,IDEF:70,CLU:70,HAN:70},
    career:{ seasonCount:1, nextSeasonMods:{}, _seenSeasonEventIds:[] }
  };
  var PROFILE_KEYS = [];
  function addAttrDelta(key, delta) { STATE.attrs[key] = (STATE.attrs[key] || 0) + delta; }
  function addProfileDelta(key, delta) { PROFILE_KEYS.push(key); STATE.career.profile = STATE.career.profile || {}; STATE.career.profile[key] = (STATE.career.profile[key] || 0) + delta; }
  function addSeasonMod(key, delta, min, max) { var m=STATE.career.nextSeasonMods; m[key]=Math.max(min,Math.min(max,(m[key]||0)+delta)); }
  function calcOVR() { return 88; }
`, context);
vm.runInContext(storySrc, context, { filename:'perfect-player-era-story.js' });

const api = context.PP_ERA_STORY;
assert.ok(api);
assert.equal(api.config.cooldownGames, 8);
assert.equal(api.config.maxPerSeason, 2);
assert.equal(context.STAGED_BRANCH_EVENTS.length, 9);
for (const era of [2003, 2010, 2016]) {
  assert.equal(api.events.filter(event => event._eraStoryYear === era).length, 3, `${era} needs three events`);
}
const ids = api.events.map(event => event.id);
assert.equal(new Set(ids).size, ids.length, 'era story ids must be unique');
assert.ok(ids.every(id => !id.startsWith('pp_season_')), 'era stories must not use daily-event ids');
assert.ok(api.events.every(event => event.choices.length >= 2 && event.choices.every(choice => typeof choice.apply === 'function')));

const career = context.STATE.career;
career.eraStory = { score:'old', flags:null, history:null, themeCooldowns:null, season:null };
const initialized = api.ensureState(career, 2003);
assert.equal(initialized.version, 1);
assert.equal(initialized.score, 0);
assert.deepEqual(Object.keys(initialized.flags), []);
assert.ok(Array.isArray(initialized.history));
assert.equal(api.findDueEvent({ career, era:2003, gamesPlayed:7 }), null, 'no opening popup before game 8');
const first = api.findDueEvent({ career, era:2003, gamesPlayed:8 });
assert.equal(first.id, 'era_story_2003_deadline');
career._seenSeasonEventIds.push(first.id);
const beforeClu = context.STATE.attrs.CLU;
const result = first.choices[1].apply();
assert.match(result, /关键球\+1/);
assert.match(result, /争议\+1/, 'the disclosed controversy effect must appear in result text');
assert.equal(context.STATE.attrs.CLU, beforeClu + 1, 'choice consequence should affect the player');
assert.equal(career.eraStory.history.length, 1);
assert.equal(api.findDueEvent({ career, era:2003, gamesPlayed:15 }), null, 'cooldown/minimum window should prevent a chain popup');
assert.equal(api.findDueEvent({ career, era:2003, gamesPlayed:25 }), null);
const second = api.findDueEvent({ career, era:2003, gamesPlayed:26 });
assert.equal(second.id, 'era_story_2003_radio');
career._seenSeasonEventIds.push(second.id);
second.choices[0].apply();
assert.equal(api.findDueEvent({ career, era:2003, gamesPlayed:50 }), null, 'per-season cap must hold');
career.seasonCount = 2;
const third = api.findDueEvent({ career, era:2003, gamesPlayed:50 });
assert.equal(third.id, 'era_story_2003_forum_tape', 'unfinished story may continue in a later season');

const summary = api.getSummary(career);
assert.equal(summary.completed, 2);
summary.flags.tamper = true;
summary.history.push({ eventId:'tamper' });
assert.equal(career.eraStory.flags.tamper, undefined, 'summary flags must be detached');
assert.equal(career.eraStory.history.length, 2, 'summary history must be detached');

api.events.forEach(event => event.choices.forEach(item => item.apply()));
const allowedProfileKeys = new Set(['fame','businessValue','mediaTrust','controversy','chinaPopularity','loyalty','leadership','coachTrust','lockerRoomTrust','fanSupport','legacyBonus']);
for (const key of context.PROFILE_KEYS) assert.ok(allowedProfileKeys.has(key), `unknown career profile key: ${key}`);
assert.doesNotMatch(storySrc, /\b(?:discipline|ambition)\s*:/, 'era story must not write ghost profile keys');
assert.doesNotMatch(storySrc, /防守锨点/);
assert.match(storySrc, /防守锚点/);

assert.match(coreSrc, /PP_ERA_STORY\.findDueEvent/);
assert.match(coreSrc, /if \(ev\._eraStory\) return false/);
assert.match(coreSrc, /recordBranchChoice\(ev, ch, msg, 'season'\)/, 'existing season modal must record branchHistory');
assert.match(bootSrc, /perfect-player-era-story\.js\?v=/, 'story module must be in the boot story group');

console.log('✓ era story: 9 unique events, lazy old-save init, cooldown, season cap, consequences and shared modal path');
