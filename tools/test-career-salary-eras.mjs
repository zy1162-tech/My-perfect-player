import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSimulation } from './bench-era-baseline.mjs';

const source = fs.readFileSync(new URL('../assets/js/perfect-player-career-events.js', import.meta.url), 'utf8');
function fixture(era = 'current', seasons = 0, ovr = 96) {
  const f = createSimulation(era, 73), c = f.context;
  c.autoSaveGame = () => {};
  c.HUPU_USER = {nickname:'Salary Test Player',avatar:''};
  c.getHupuDisplayName = () => c.HUPU_USER.nickname;
  c.document.body.insertAdjacentHTML = () => {};
  c.refreshPlayerStateStripLive = () => {};
  f.state.position = 'SG'; f.state.careerTeam = 'LAL'; f.state.finalOVR = ovr;
  f.state.attrs = Object.fromEntries(['FIN','MID','threePT','DNK','HAN','PAS','PDEF','IDEF','REB','BLK','STL','ATH','STR','CLU','STA'].map(k=>[k,k==='STA'?0:ovr]));
  f.state.career = c.createFreshCareer();
  f.state.career.seasonCount = seasons; f.state.career.currentAge = 19 + seasons;
  f.state.season = {games:[],schedule:Array.from({length:82},(_,day)=>({opponent:'BOS',day})),events:{injuryGamesLeft:0},playerStats:{games:0},playoffStats:{games:0}};
  vm.runInContext(source, c);
  return {...f, api:c.PP_CAREER_EVENTS};
}

// Fixed published NBA opening-year facts, independently asserted against production calculations.
for (const [era, year, cap, rookieFirst, minimum] of [
  [2003,2003,43840000,4018920,366931],
  [2010,2010,58044000,5144280,473604],
  [2016,2016,94143000,5903160,543471],
  ['current',2026,164961000,14748000,1357763]
]) {
  const f = fixture(era), c = f.context;
  assert.equal(c.getCareerSalaryMarket().year, year);
  assert.equal(c.getCareerSalaryMarket().cap, cap);
  assert.equal(f.api.getState().money.annualSalary, minimum);
  // Salary state may already exist while the player is being built. The real draft entry must replace it.
  f.state._draftPending = {round:1,pick:1,type:'lottery',contractYears:4};
  c.finalizeDraft('LAL');
  assert.equal(f.state.career.draft.year, year);
  assert.equal(f.api.getState().money.annualSalary, rookieFirst);
  assert.equal(f.api.getState().money.contract.type, 'rookie');
  f.state.finalOVR = 99;
  assert.equal(f.api.getState().money.annualSalary, rookieFirst, 'a great rookie must retain his signed scale contract');
}

{
  const f = fixture(), c = f.context;
  f.state._draftPending = {round:1,pick:1,type:'lottery',contractYears:4};
  c.finalizeDraft('LAL');
  const expected = [14748000,15485760,16223040,20457253];
  let gross = 0;
  for (let season = 0; season < 4; season++) {
    f.state.career.seasonCount = season; f.state.career.contract = 4 - season;
    const e = f.api.getState();
    assert.equal(e.money.annualSalary, expected[season]);
    for (let day = 0; day < 82; day++) f.api.settleGame(season + ':' + day, day % 2 ? {mins:20} : null, {}, {});
    gross += expected[season];
    assert.equal(e.money.salary, gross, 'team-game payments including injury/DNPs must conserve each signed annual salary');
    const before = e.money.salary;
    f.api.settleGame(season + ':P1', {mins:30}, {}, {isPlayoff:true});
    assert.equal(e.money.salary, before);
    Object.assign(f.state, JSON.parse(JSON.stringify(f.state)));
    assert.equal(f.api.getState().money.salary, gross);
    assert.equal(f.api.settleGame(season + ':81', null, {}, {}), false, 'restoring must not pay the same game twice');
  }
  f.state.career.seasonCount = 4; f.state.career.contract = 4;
  f.api.renewContract({sameTeam:true});
  assert.equal(f.api.getState().money.annualSalary, 41240250);
  assert.equal(f.api.getState().money.contract.type, 'market');
  const signed = f.api.getState().money.annualSalary;
  f.state.finalOVR = 72;
  assert.equal(f.api.getState().money.annualSalary, signed, 'performance must not rewrite an already signed contract');
}

{
  const veteran = fixture(2016, 10), c = veteran.context;
  assert.equal(c.getCareerSalaryMarket().year, 2026);
  assert.equal(veteran.api.getState().money.annualSalary, 57736350, 'a ten-year superstar in the actual 2026 market must receive the 35 percent starting tier');
  veteran.state.career.contract = 3;
  veteran.api.renewContract({sameTeam:true});
  const home = Array.from(veteran.api.getState().money.contract.salaries);
  veteran.api.renewContract({sameTeam:false});
  const away = Array.from(veteran.api.getState().money.contract.salaries);
  assert.ok(home[1] - home[0] > away[1] - away[0], 'same-team and other-team raises must differ');
  const role = fixture(2016, 10, 75), edge = fixture(2016, 10, 60);
  assert.equal(role.api.getState().money.annualSalary, 7423245);
  assert.equal(edge.api.getState().money.annualSalary, 3876528, 'a low-rated veteran must still receive the applicable experience minimum');
  assert.equal(fixture(2010, 5).context.getCareerSalaryMarket().cap, 70000000);
  assert.equal(fixture(2010, 6).context.getCareerSalaryMarket().cap, 94143000, 'the historic 2016 cap jump must occur as the career calendar advances');
  assert.equal(fixture('current', 10).context.getCareerSalaryMarket().projected, true, 'unknown future seasons must be marked as estimates');
}

{
  const f = fixture(), c = f.context;
  f.state.career.draft = {round:1,pick:1,type:'lottery',contractYears:4};
  const e = f.api.getState();
  delete e.money.contract; e.version = 1; e.money.annualSalary = 6000000;
  e.money.cash = e.money.salary = e.money.earned = 100000; e.money.entries = [{id:'old',amount:100000}];
  e.season.salaryGames = 5; e.season.settled['already-paid'] = true;
  const attrs = JSON.stringify(f.state.attrs), ovr = f.state.finalOVR;
  f.api.getState();
  assert.equal(e.money.annualSalary, 14748000);
  assert.equal(e.money.cash, 100000, 'migration must retain actual recorded income without fabricating retroactive wage differences');
  assert.equal(e.money.entries.length, 1);
  f.api.settleGame('next-game', null, {}, {});
  const nextPay = Math.round(14748000 * 6 / 82) - Math.round(14748000 * 5 / 82);
  assert.equal(e.money.salary, 100000 + nextPay);
  assert.equal(e.money.cash, e.money.salary);
  assert.equal(f.api.settleGame('already-paid', null, {}, {}), false);
  assert.equal(JSON.stringify(f.state.attrs), attrs); assert.equal(f.state.finalOVR, ovr);
}

{
  for (const era of [2003,2010,2016,'current']) {
    const f = fixture(era), e = f.api.getState(), ratio = f.context.getCareerSalaryMarket().cap / 164961000;
    e.pending = {id:'brand_day',key:'brand'};
    assert.equal(f.api.choose(0), true);
    assert.equal(e.money.offcourt, Math.round(180000 * ratio));
    e.pending = {id:'team_evening',key:'team'};
    assert.equal(f.api.choose(0), true);
    assert.equal(e.money.spent, Math.round(35000 * ratio));
    assert.equal(e.money.cash, e.money.earned - e.money.spent);
  }
  const f = fixture();
  f.state.career.draft = {round:0,twoWay:true,contractYears:1};
  f.api.signContract({rookie:true});
  assert.equal(f.api.getState().money.annualSalary, 678882);
}

console.log('Era salary checks passed: four official cap/minimum anchors, actual first-pick scale contracts, draft initialization, all four rookie years, 82-game wage conservation, veteran tiers, contract raises, old-ledger migration, DNPs, playoffs and era-scaled offcourt amounts.');
