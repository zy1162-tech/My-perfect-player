// Production-engine baseline. No browser storage, UI callbacks or game parameters are changed.
// node tools/bench-era-baseline.mjs [gamesPerEra=2610] [growthTrials=32] [seed=20261001]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scripts = [
  'assets/data/perfect-player-pool-local.js',
  'assets/data/player-ages-local.js',
  'assets/data/era-mode-data.js',
  'assets/data/era-complete-rosters.js',
  'assets/data/era-opening-membership.js',
  'assets/data/player-rating-calibration.js',
  'assets/data/era-presentation.js',
  'assets/js/hupu/script-01-2678-5hu3djrc-upload-1783494754597-12.js',
  'assets/js/current-player-ratings-2026.js',
  'assets/js/hupu/script-02-2678-gd4jvxrc-upload-1783494754597-15.js',
  'assets/js/hupu/script-03-2678-456sfprc-upload-1783494754597-18.js',
  'assets/js/hupu/script-04-2678-mdo4zerc-upload-1783494754597-21.js',
  'assets/js/hupu/script-05-2678-qlg35lrc-upload-1783494754597-24.js',
  'assets/js/perfect-player-core.js',
  'assets/js/perfect-player-mod-v4.js',
  'assets/js/perfect-player-era-mode.js'
].map(file => [file, readFileSync(new URL('../' + file, import.meta.url), 'utf8')]);

export function createSimulation(era, seed) {
  const context = {
    Math:Object.create(Math), console:{ log() {}, warn() {}, error() {} },
    setTimeout:() => 0, clearTimeout() {}, setInterval:() => 0, clearInterval() {},
    document:{
      getElementById:() => null, querySelector:() => null, querySelectorAll:() => [],
      createElement:() => ({ style:{}, appendChild() {}, setAttribute() {}, addEventListener() {} }),
      addEventListener() {}, head:{ appendChild() {} }, body:{ appendChild() {} }
    },
    localStorage:{ getItem:() => null, setItem() {}, removeItem() {} },
    Storage:{ waitForReady:() => Promise.resolve(), getValue:() => Promise.resolve(null), setValue:() => Promise.resolve() },
    location:{ href:'http://127.0.0.1/', protocol:'http:' }, navigator:{}, addEventListener() {}
  };
  context.window = context;
  vm.createContext(context);
  for (const [file, source] of scripts) vm.runInContext(source, context, { filename:file });
  // core redirects Math.random to rngNext; seed its existing VM-local state before opening the era.
  vm.runInContext(`_rngState = { s:${seed >>> 0}, c:0 };`, context);
  const state = vm.runInContext('STATE', context);
  state.mode = era === 'current' ? 'current' : 'legend';
  state.eraStart = era === 'current' ? null : era;
  state.careerTeam = null;
  state.finalOVR = 0;
  if (state.mode === 'legend') context.applyLegendEraLeague();
  return {
    context, state,
    teams:vm.runInContext('NBA2K_TEAMS', context),
    rosters:vm.runInContext('NBA2K_DATA', context)
  };
}

export function summarize(values) {
  if (!values.length) return { n:0, mean:null, p10:null, p50:null, p90:null };
  assert.ok(values.every(Number.isFinite), 'baseline metrics must be finite');
  const sorted = values.slice().sort((a, b) => a - b);
  const percentile = p => {
    const index = (sorted.length - 1) * p, low = Math.floor(index), high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  };
  const round = x => Number(x.toFixed(4));
  return {
    n:values.length, mean:round(values.reduce((a, b) => a + b, 0) / values.length),
    p10:round(percentile(0.1)), p50:round(percentile(0.5)), p90:round(percentile(0.9))
  };
}

function add(metrics, values) {
  for (const [key, value] of Object.entries(values)) (metrics[key] ||= []).push(value);
}

function distributions(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, values]) => [key, summarize(values)]));
}

function ageBand(age) {
  return age <= 22 ? '18-22' : age <= 25 ? '23-25' : age <= 29 ? '26-29' : age <= 33 ? '30-33' : age <= 37 ? '34-37' : '38+';
}

export function runBaseline({ gamesPerEra = 2610, growthTrials = 32, seed = 20261001 } = {}) {
  assert.ok(Number.isInteger(gamesPerEra) && gamesPerEra > 0);
  assert.ok(Number.isInteger(growthTrials) && growthTrials > 0);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  const report = {
    seed, gamesPerEra, growthTrials,
    scope:'Fixed opening rosters, neutral player effects, balanced team systems. Games use the full production matchup/box engine. Growth is a repeated one-off offseason transition with contracts held at 100; retirement is the production retirement rule applied to the opening cohort. No injury, trade or complete-career claims.',
    eras:{}
  };
  for (const [eraIndex, era] of [2003, 2010, 2016, 'current'].entries()) {
    const { context:c, state, teams, rosters } = createSimulation(era, seed + eraIndex);
    const teamMetrics = {}, playerMetrics = {}, roles = {}, growth = {}, retirement = {};
    const pairs = teams.flatMap((a, i) => teams.slice(i + 1).map(b => [a, b]));
    const appearances = Object.fromEntries(teams.map(team => [team, 0]));
    const totals = { pts:0, fgm:0, fga:0, threeM:0, threeA:0, ftm:0, fta:0 };
    let overtimeGames = 0;
    for (let game = 0; game < gamesPerEra; game++) {
      const [a, b] = pairs[game % pairs.length];
      const result = c.simulate82StyleMatchup(a, b, {
        teamAHome:Math.floor(game / pairs.length) % 2 === 0, neutralState:true
      });
      if (result.ot) overtimeGames++;
      for (const [team, score] of [[a, result.scoreA], [b, result.scoreB]]) {
        appearances[team]++;
        const rows = result.boxScore[team];
        const sums = Object.fromEntries(['pts','mins','fgm','fga','threeM','threeA','ftm','fta','reb','ast','stl','blk','tov'].map(key =>
          [key, rows.reduce((sum, row) => sum + row[key], 0)]));
        assert.equal(sums.pts, score, 'box score must conserve team points');
        assert.equal(sums.mins, 240, 'current box engine always allocates 240 minutes, including overtime');
        for (const row of rows) {
          assert.ok(Object.keys(sums).every(key => Number.isFinite(row[key]) && row[key] >= 0));
          assert.ok(row.fgm <= row.fga && row.threeM <= row.threeA && row.threeM <= row.fgm && row.threeA <= row.fga && row.ftm <= row.fta);
          assert.equal(row.pts, 2 * row.fgm + row.threeM + row.ftm, 'individual shooting must explain points');
        }
        add(teamMetrics, {
          ...sums, pace:result.pace, fgPct:sums.fgm / sums.fga,
          threePct:sums.threeA ? sums.threeM / sums.threeA : 0,
          ftPct:sums.fta ? sums.ftm / sums.fta : 0, threeAttemptShare:sums.threeA / sums.fga
        });
        for (const key of Object.keys(totals)) totals[key] += sums[key];
        const starters = Object.values(c.calcTeamLineup(team).starters).sort((x, y) => y.ovr - x.ovr);
        const starterSet = new Set(starters);
        const byName = new Map(rows.map(row => [row.name, row]));
        for (const player of rosters[team]) {
          const row = byName.get(player.cname || player.name);
          const values = { mins:row?.mins || 0, fga:row?.fga || 0, pts:row?.pts || 0, shotShare:(row?.fga || 0) / sums.fga };
          const role = player === starters[0] ? 'primary' : player === starters[1] ? 'secondary' : starterSet.has(player) ? 'otherStarters' : row ? 'bench' : 'inactive';
          add(playerMetrics, values);
          add(roles[role] ||= {}, values);
        }
      }
    }
    const opening = structuredClone(rosters);
    const identities = new Map();
    const ageAnomalies = [];
    for (const team of teams) for (const p of opening[team]) {
      const key = c.normalizePlayerIdentityKey(p.name);
      const locations = identities.get(key) || [];
      locations.push(team + ':' + p.name);
      identities.set(key, locations);
      const candidate = structuredClone(p);
      const age = c.getLeaguePlayerAge(candidate);
      assert.ok(Number.isFinite(age), 'opening player age must be finite');
      if (age < 18 || age > 42) ageAnomalies.push({ team, name:p.name, age });
      let retiredAt = null;
      for (let year = age; year <= Math.max(age, 50); year++) {
        if (c.rngNext() * 100 < c.getLeagueRetirementChance(candidate, year)) { retiredAt = year; break; }
      }
      assert.notEqual(retiredAt, null, 'retirement must occur within the sampled age range');
      const tier = p.ovr >= 90 ? '90+' : p.ovr >= 82 ? '82-89' : p.ovr >= 75 ? '75-81' : 'below75';
      (retirement[tier] ||= []).push(retiredAt);
    }
    for (let trial = 0; trial < growthTrials; trial++) {
      for (const team of teams) rosters[team] = structuredClone(opening[team]);
      vm.runInContext(`_rngState = { s:${(seed + eraIndex * 1000 + trial) >>> 0}, c:0 };`, c);
      state._contractsInited = true;
      state.career.seasonCount = 0;
      state._simPowerBaseline = null;
      c.clearLineupCache();
      const cohort = teams.flatMap(team => rosters[team].map(p => {
        p.contract = 100;
        return { p, age:c.getLeaguePlayerAge(p), ovr:p.ovr };
      }));
      c.evolveLeague();
      for (const { p, age, ovr } of cohort) add(growth[ageBand(age)] ||= {}, { ovrChange:p.ovr - ovr });
    }
    report.eras[era] = {
      openingPlayers:Object.values(opening).flat().length,
      ageAnomalies,
      duplicateIdentities:[...identities.values()].filter(rows => rows.length > 1),
      teamAppearances:appearances, overtimeGames,
      weightedShooting:{ fgPct:totals.fgm / totals.fga, threePct:totals.threeM / totals.threeA, ftPct:totals.ftm / totals.fta, threeAttemptShare:totals.threeA / totals.fga },
      teams:distributions(teamMetrics), players:distributions(playerMetrics),
      roles:Object.fromEntries(Object.entries(roles).map(([key, value]) => [key, distributions(value)])),
      growth:Object.fromEntries(Object.entries(growth).map(([key, value]) => [key, distributions(value)])),
      retirementAges:Object.fromEntries(Object.entries(retirement).map(([key, values]) => [key, summarize(values)]))
    };
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [gamesPerEra = 2610, growthTrials = 32, seed = 20261001] = process.argv.slice(2).map(Number);
  console.log(JSON.stringify(runBaseline({ gamesPerEra, growthTrials, seed }), null, 2));
}
