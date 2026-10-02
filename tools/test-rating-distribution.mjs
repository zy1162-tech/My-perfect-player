import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const teams = ['ATL','BKN','BOS','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
const ctx = { console, Math, window:null, STATE:{mode:'legend',eraStart:2003,career:{seasonCount:0,flags:{}}}, NBA2K_TEAMS:teams,
  NBA2K_DATA:Object.fromEntries(teams.map(t => [t,[]])), clearLineupCache(){}, processDraft(){},
  document:{getElementById(){return null;},createElement(){return {};}} };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['assets/data/era-mode-data.js','assets/data/era-complete-rosters.js','assets/data/player-rating-calibration.js','assets/js/perfect-player-era-mode.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename:file });
}

function percentile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]; }
function summary(values) {
  const a = values.slice().sort((x,y) => x-y);
  return { n:a.length, min:a[0], max:a.at(-1), mean:+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2), median:percentile(a,.5),
    p10:percentile(a,.1), p25:percentile(a,.25), p75:percentile(a,.75), p90:percentile(a,.9),
    exact70:a.filter(x=>x===70).length, below70:a.filter(x=>x<70).length };
}
function mean(a) { return a.reduce((s,x)=>s+x,0)/a.length; }

const audit = { eras:{} };
for (const era of [2003,2010,2016]) {
  ctx.STATE.eraStart = era;
  ctx.STATE._legendLeagueApplied = null;
  ctx.applyLegendEraLeague();
  const players = teams.flatMap(t => ctx.NBA2K_DATA[t]);
  audit.eras[era] = summary(players.map(p => p.ovr));
  assert.equal(audit.eras[era].min,70,`${era} active roster modern-scale minimum`);
  assert.ok(audit.eras[era].exact70 / players.length < .15, `${era} exact-70 spike`);
  assert.ok(new Set(players.filter(p=>p.ovr<=74).map(p=>p.ovr)).size >= 5, `${era} low band retains at least five values`);
  const ordinary = players.filter(p => !(p._ratingReference && p._ratingReference.override) && p._ratingKind !== 'rookie');
  const deltas = ordinary.map(p => p.ovr - p._sourceOvr);
  audit.eras[era].meanDelta = +(deltas.reduce((s,x)=>s+x,0)/deltas.length).toFixed(2);
  audit.eras[era].meanAbsDelta = +(deltas.reduce((s,x)=>s+Math.abs(x),0)/deltas.length).toFixed(2);
  audit.eras[era].raisedRatio = +(deltas.filter(x=>x>0).length/deltas.length).toFixed(3);
  audit.eras[era].loweredRatio = +(deltas.filter(x=>x<0).length/deltas.length).toFixed(3);
  audit.eras[era].maxAbsDelta = Math.max(...deltas.map(Math.abs));
  assert.ok(ordinary.every(p=>Math.abs(Number(p._ratingReference.performanceAdjustment)||0)<=3),`${era} reliability adjustment stays within ±3`);
  assert.ok(players.every(p=>p._ratingRoleAdjustment===0 && p._preRoleNormalizationOvr===p.ovr),`${era} team assembly never recalibrates ratings`);
  assert.ok(players.filter(p=>p._ratingKind==='rookie').every(p=>p._ratingRoleAdjustment===0), `${era} rookies are not calibrated twice`);
  for (const team of teams) {
    const ordered = ctx.NBA2K_DATA[team].slice().sort((a,b)=>b.ovr-a.ovr);
    assert.ok(mean(ordered.slice(0,5).map(p=>p.ovr)) > mean(ordered.slice(-5).map(p=>p.ovr)), `${era} ${team} source-driven depth hierarchy`);
  }
}
const mappedLow = Array.from({length:35},(_,i)=>ctx.PP_RATING_CALIBRATION.modernScaleBaseline(45+i));
assert.ok(mappedLow.every((v,i)=>i===0||v>=mappedLow[i-1]),'legacy-to-modern baseline is monotonic');
assert.ok(mappedLow.every((v,i)=>i===0||v-mappedLow[i-1]<=1),'adjacent source ratings remain continuous');
assert.ok(new Set(mappedLow.map(Math.round)).size>=8,'low source ratings retain broad relative separation');
ctx.STATE.eraStart = 2003; ctx.STATE._legendLeagueApplied = null; ctx.applyLegendEraLeague();
const amare = ctx.NBA2K_DATA.PHX.find(p => p.name === "Amar'e Stoudemire");
assert.deepEqual([amare.ovr, amare._age, amare._peakOvr], [85,21,92]);
ctx.STATE.eraStart = 2010; ctx.STATE._legendLeagueApplied = null; ctx.applyLegendEraLeague();
assert.equal(ctx.NBA2K_DATA.GSW.find(p => p.name === 'Stephen Curry').ovr, 82);

const draftRows = Object.values(ctx.__PP_ERA_MODE_DATA__.draftClasses).flat();
const draftValues = draftRows.map(r => ctx.PP_RATING_CALIBRATION.calibrateEra(r, {kind:'rookie',sourceOvr:r.rating,pick:r.pick,targetAge:r.age}).rookieOvr);
audit.historicalDraft = summary(draftValues);
assert.equal(draftRows.length, 600);
assert.equal(audit.historicalDraft.below70, 0);
assert.ok(audit.historicalDraft.exact70 < draftRows.length * .12, 'historical draft exact-70 spike');
const tierMeans = [[1,3],[4,10],[11,20],[21,30]].map(([lo,hi]) => mean(draftRows.map((r,i)=>({r,v:draftValues[i]})).filter(x=>x.r.pick>=lo&&x.r.pick<=hi).map(x=>x.v)));
assert.ok(tierMeans[0] > tierMeans[1] && tierMeans[1] > tierMeans[2] && tierMeans[2] > tierMeans[3], `pick tiers monotonic ${tierMeans}`);
const missing = ctx.PP_RATING_CALIBRATION.calibrateEra({nameEn:'Missing Rating',pick:30}, {kind:'rookie',pick:30});
assert.equal(missing.ratingMissing, true);
assert.ok(missing.rookieOvr >= 70);

const core = fs.readFileSync('assets/js/perfect-player-core.js','utf8');
const draftFn = core.match(/function draftOvrByPick\(pick\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(draftFn);
const future = {};
vm.createContext(future); vm.runInContext(`${draftFn};this.f=draftOvrByPick;`, future);
const futureValues = Array.from({length:100},(_,i)=>future.f(i+1));
audit.generated = summary(futureValues);
assert.equal(audit.generated.below70, 0);
assert.ok(new Set(futureValues.slice(45)).size >= 3, 'future tail must not be fixed 70');
ctx.STATE._eraRookieSeq = 0;
const eraFuture = Array.from({length:100},()=>ctx.PP_ERA_MODE.generateRookie('ATL',2030).ovr);
audit.generatedEra = summary(eraFuture);
assert.equal(audit.generatedEra.below70,0);
assert.ok(audit.generatedEra.exact70 <= 25, 'future legend-era rookies must not pile at 70');
console.log('✓ rating distribution audit', JSON.stringify(audit));
