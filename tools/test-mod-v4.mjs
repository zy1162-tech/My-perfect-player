import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const rosterRaw = await readFile('assets/data/historical/legend-team-rosters.json', 'utf8');
const rosters = JSON.parse(rosterRaw);
assert.equal(rosters.version, 4);
assert.equal(rosters.teams.length, 7);
const byId = Object.fromEntries(rosters.teams.map((team) => [team.id, team]));
assert.ok(byId['mia-2011-12'].players.some((p) => p.nameEn === 'LeBron James'));
assert.ok(byId['sas-2004-05'].players.some((p) => p.nameEn === 'Tim Duncan'));

const localContext = { window: {} };
vm.createContext(localContext);
vm.runInContext(await readFile('assets/data/historical/legend-team-rosters-local.js', 'utf8'), localContext);
assert.equal(localContext.window.__PP_LEGEND_ROSTERS__.teams.length, 7);

const requestedTierFour = [
  'dunk_threat', 'finisher', 'fast_break', 'leader_aura',
  'box_out', 'perimeter_lock', 'rim_protector', 'iron_man'
];
const skillState = {
  attrs: Object.fromEntries(['threePT','MID','FIN','DNK','HAN','PAS','PDEF','IDEF','BLK','REB','ATH','STR','CLU'].map((key) => [key, 99])),
  career: {
    profile: { leadership: 99, coachTrust: 99 },
    skills: { points: 0, earned: 0, purchased: Object.fromEntries(requestedTierFour.map((id) => [id, 3])) },
    flags: { legendChallenge: { skillUnlocks: Object.fromEntries(requestedTierFour.map((id) => [id, true])) } }
  },
  season: { awards: [] }
};
const skillContext = { window: {}, STATE: skillState };
skillContext.window = skillContext;
vm.createContext(skillContext);
vm.runInContext(await readFile('assets/js/perfect-player-skills.js', 'utf8'), skillContext);
skillContext.PP_SKILLS.syncLegendPurchasedFromUnlocks();
for (const id of requestedTierFour) {
  assert.equal(skillContext.PP_SKILLS.getEffectiveSkillLevel(id), 4, `${id} should reach Lv.4`);
  assert.equal(skillContext.PP_SKILLS.getStyleSkillMu(id), 1.21, `${id} should use Lv.4 strength`);
  skillState.career.skills.purchased[id] = 3;
  delete skillState.career.flags.legendChallenge.skillUnlocks[id];
  assert.equal(skillContext.PP_SKILLS.getStyleSkillMu(id), 1.13, `${id} Lv.3 baseline`);
  skillState.career.flags.legendChallenge.skillUnlocks[id] = true;
  skillState.career.skills.purchased[id] = 4;
}

const legendSource = await readFile('assets/js/perfect-player-legend-challenge.js', 'utf8');
assert.match(legendSource, /countCareerRegularMvp\(\) >= 1 \|\| countCareerFmvp\(\) >= 1/);
for (const id of ['mia-2011-12', 'sas-2004-05']) assert.ok(legendSource.includes(id));
for (const id of requestedTierFour) assert.ok(legendSource.includes(`'${id}'`), `${id} reward mapping`);
const htmlSource = await readFile('nba-perfect-player.html', 'utf8');
const localLegendAt = htmlSource.indexOf('legend-team-rosters-local.js');
const bootAt = htmlSource.indexOf('perfect-player-boot.js');
assert.ok(localLegendAt >= 0 && bootAt > localLegendAt, 'local legend data must load before boot');

const modSource = await readFile('assets/js/perfect-player-mod-v4.js', 'utf8');
assert.match(modSource, /if \(coachReady && leaderReady\) return 3/);
assert.match(modSource, /if \(coachReady \|\| leaderReady\) return 2/);
assert.match(modSource, /showRecruitmentMarket\(function\(\)/);
assert.ok(htmlSource.includes('perfect-player-mod-v4.js'), 'V4 module should load after core');
const modProfile = { coachTrust: 0, leadership: 0, fame: 0 };
const modContext = {
  STATE: { career: { profile: modProfile, seasonCount: 2 }, finalOVR: 90, season: { awards: [] } },
  getCareerProfile: () => modProfile
};
modContext.window = modContext;
vm.createContext(modContext);
vm.runInContext(modSource, modContext);
assert.equal(modContext.PP_MOD_V4.hasRosterAuthority(), true, '90 OVR team leader should receive offseason roster authority');
assert.equal(modContext.getVeteranMaintenanceLevel(30), 0);
assert.equal(modContext.getVeteranMaintenanceLevel(31), 1);
modProfile.coachTrust = 10;
assert.equal(modContext.getVeteranMaintenanceLevel(31), 2);
modProfile.leadership = 10;
assert.equal(modContext.getVeteranMaintenanceLevel(31), 3);

console.log('V4 feature checks passed: local legends, 7 dream teams, real Lv.4 boosts, maintenance, recruitment.');
