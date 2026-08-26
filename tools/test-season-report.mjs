import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/perfect-player-season-report.js', import.meta.url), 'utf8');
const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'perfect-player-season-report.js' });
const api = context.PP_SEASON_REPORT._test;

function bracket(prefix, userTeam = null) {
  const teams = Array.from({ length: 8 }, (_, i) => ({ team: i === 0 && userTeam ? userTeam : `${prefix}${i + 1}` }));
  return {
    conf: prefix,
    teams,
    rounds: [
      [
        { high: teams[0], low: teams[7], winner: null },
        { high: teams[1], low: teams[6], winner: null },
        { high: teams[2], low: teams[5], winner: null },
        { high: teams[3], low: teams[4], winner: null }
      ],
      [null, null], [null], [null]
    ],
    currentRound: 0,
    results: [],
    confChampion: null
  };
}

function earlyEliminationState() {
  const primary = bracket('P', 'USER');
  const eliminated = {
    round: 0, seriesIdx: 0, roundName: '首轮', teamA: 'USER', teamB: 'P8', winner: 'P8',
    winsA: 1, winsB: 4, aWon: false, winnerWins: 4, loserWins: 1, seriesGames: [], isMySeries: true
  };
  primary.rounds[0][0].winner = 'P8';
  primary.results.push(eliminated);
  return {
    careerTeam: 'USER', finalOVR: 96, _careerSaved: false,
    career: { seasonCount: 0, seasons: [], honors: [], totalStats: { pts: 2000, games: 82 }, profile: {}, flags: {} },
    season: { playoffBracket: primary, otherBracket: bracket('O'), awards: [], playoffEliminated: true, playerStats: { pts: 2000, games: 82 } }
  };
}

function completedFinalsState(seriesGames, awards = []) {
  const primary = bracket('C', 'USER');
  const other = bracket('D');
  const finalResult = {
    round: 3, seriesIdx: 0, teamA: 'USER', teamB: 'D1', winner: 'USER', winnerWins: 4, loserWins: 2,
    winsA: 4, winsB: 2, aWon: true, seriesGames
  };
  primary.rounds[3][0] = { high: { team: 'USER' }, low: { team: 'D1' }, winner: 'USER' };
  primary.results.push(finalResult);
  return {
    careerTeam: 'USER', finalOVR: 98,
    season: { playoffBracket: primary, otherBracket: other, awards },
    career: { seasonCount: 2, seasons: [], honors: [], totalStats: {}, profile: {}, flags: {} }
  };
}

let simCalls = 0;
const env = {
  simulateGame(teamA, teamB, game) {
    simCalls++;
    const championLines = [
      { name: `${teamA} Scorer`, pts: 31, reb: 5, ast: 4, fgm: 11, fga: 22, ftm: 6, fta: 7 },
      { name: `${teamA} OVR Star`, pts: 19, reb: 10, ast: 7, fgm: 7, fga: 14, ftm: 3, fta: 4 }
    ];
    return { won: true, scoreA: 118, scoreB: 102, home: game === 0 || game === 1 || game === 4 || game === 6,
      boxScore: { [teamA]: championLines, [teamB]: [{ name: `${teamB} Star`, pts: 26, reb: 7, ast: 5, fgm: 9, fga: 20, ftm: 5, fta: 6 }] } };
  },
  teamName: team => `队-${team}`,
  getRoster: team => [
    { name: `${team} OVR Star`, cname: `${team} OVR Star`, ovr: 99 },
    { name: `${team} Scorer`, cname: `${team} Scorer`, ovr: 84 }
  ],
  playerName: () => '玩家'
};

{
  const state = earlyEliminationState();
  const originalElimination = JSON.stringify(state.season.playoffBracket.results[0]);
  const finale = api.finalizeLeagueSeason(state, env);
  assert.ok(finale?.complete, '联盟收官应完成');
  assert.notEqual(finale.champion, 'USER', '首轮淘汰的玩家不能被重抽为冠军');
  assert.equal(JSON.stringify(state.season.playoffBracket.results[0]), originalElimination, '已完成的淘汰系列赛不得被改写');
  assert.equal(finale.finalsMvp.name, `${finale.champion} Scorer`, 'FMVP 应来自总决赛实际汇总，而不是最高 OVR');
  assert.equal(finale.finalsMvp.ovr, 84);
  assert.equal(state.season.awards.some(a => String(a.label || a).includes('总冠军')), false, '非玩家冠军不能写入玩家奖项');
  const callsAfterFirst = simCalls;
  const again = api.finalizeLeagueSeason(state, env);
  assert.equal(again, finale, '重复 finalize 应返回同一缓存对象');
  assert.equal(simCalls, callsAfterFirst, '重复 finalize 不得重新模拟');
}

{
  const primary = bracket('C', 'USER');
  const other = bracket('D');
  // 让两个分区已有确定冠军，并给出已完成总决赛；finalize 必须直接消费事实源。
  primary.rounds[3][0] = { high: { team: 'USER' }, low: { team: 'D1' }, winner: 'USER' };
  const finalResult = {
    round: 3, seriesIdx: 0, teamA: 'USER', teamB: 'D1', winner: 'USER', winnerWins: 4, loserWins: 2,
    winsA: 4, winsB: 2, aWon: true,
    seriesGames: Array.from({ length: 6 }, () => ({ boxScore: { USER: [
      { name: '玩家', isUser: true, pts: 29, reb: 8, ast: 6, fgm: 10, fga: 20, ftm: 6, fta: 7 },
      { name: '队友', pts: 18, reb: 9, ast: 4, fgm: 7, fga: 14, ftm: 2, fta: 2 }
    ], D1: [] } }))
  };
  primary.results.push(finalResult);
  const state = {
    careerTeam: 'USER', finalOVR: 98,
    season: { playoffBracket: primary, otherBracket: other, awards: [
      { label: '🏆 总冠军', isUser: true }, { label: '👑 总决赛MVP', isUser: true }, { label: '👑 总决赛MVP', isUser: true }
    ] },
    career: { seasonCount: 2, seasons: [], honors: [], totalStats: {}, profile: {}, flags: {} }
  };
  const noSeriesEnv = { ...env, simulateGame() { throw new Error('已完成总决赛不得重模拟'); }, getRoster: () => [{ name: '玩家', cname: '玩家', ovr: 98, _isUser: true }] };
  const finale = api.finalizeLeagueSeason(state, noSeriesEnv);
  assert.equal(finale.champion, 'USER');
  assert.equal(finale.isPlayerFmvp, true);
  assert.equal(state.season.awards.filter(a => String(a.label || a).includes('总决赛MVP')).length, 1, '玩家 FMVP 只能保留一次');
  assert.equal(state.season.awards.filter(a => String(a.label || a).includes('总冠军')).length, 1, '玩家冠军只能保留一次');
}

{
  // 生产 getRoster 必须走 calcTeamLineup，NBA2K_DATA 本身并不包含动态注入的玩家。
  const user = { name: '玩家', cname: '玩家', ovr: 99, pos: 'C', _isUser: true };
  const teammate = { name: 'Teammate', cname: '高评队友', ovr: 96, pos: 'PF' };
  context.STATE = { careerTeam: 'USER' };
  context.NBA2K_DATA = { USER: [teammate] };
  context.calcTeamLineup = () => ({ starters: { C: user, PF: teammate }, bench: [], allPlayers: [teammate, user] });
  const productionRoster = api.getSimulationRoster('USER');
  assert.equal(productionRoster.some(player => player._isUser), true, '生产 FMVP 兜底阵容必须包含动态玩家');

  const missingBoxState = completedFinalsState([{}, {}, {}, {}]);
  const missingBoxFinale = api.finalizeLeagueSeason(missingBoxState, {
    ...env,
    simulateGame() { throw new Error('已完成旧档不得重模拟'); },
    getRoster: api.getSimulationRoster,
    playerName: () => '玩家'
  });
  assert.equal(missingBoxFinale.isPlayerFmvp, true, '缺 box 时动态玩家应能参与确定性兜底');
  assert.equal(missingBoxFinale.finalsMvp.fallback, true);

  // 即便队友 OVR 更高，旧档中已经明确记录的用户 FMVP 也不能被无 box 推翻。
  teammate.ovr = 100;
  const preservedState = completedFinalsState([{}, {}, {}, {}], [{ label: '👑 总决赛MVP', isUser: true }]);
  const preserved = api.finalizeLeagueSeason(preservedState, {
    ...env,
    simulateGame() { throw new Error('已完成旧档不得重模拟'); },
    getRoster: api.getSimulationRoster,
    playerName: () => '玩家'
  });
  assert.equal(preserved.isPlayerFmvp, true);
  assert.equal(preserved.finalsMvp.preservedExisting, true, '证据不足时应保留旧用户 FMVP 事实');
  assert.equal(preservedState.season.awards.filter(a => String(a.label || a).includes('总决赛MVP')).length, 1);
}

{
  const roster = [
    { name: '玩家', cname: '玩家', ovr: 99, _isUser: true },
    { name: 'Actual Teammate', cname: '真实队友', ovr: 90 }
  ];
  const games = Array.from({ length: 6 }, (_, index) => {
    const userLine = { name: '玩家', isUser: true, pts: index < 3 ? 60 : 10, reb: 8, ast: 6, fgm: 20, fga: 30, ftm: 10, fta: 12, mins: 38 };
    const game = { boxScore: { USER: [
      userLine,
      { name: '真实队友', pts: 20, reb: 7, ast: 5, fgm: 8, fga: 16, ftm: 2, fta: 2, mins: 38 }
    ], D1: [] } };
    if (index === 0) { game.suspended = true; game.skipReason = 'suspension'; }
    if (index === 1) { game.suspended = true; game.skipReason = 'injury'; }
    if (index === 2) userLine.dnp = true;
    return game;
  });
  const state = completedFinalsState(games, [{ label: '👑 总决赛MVP', isUser: true }]);
  const finale = api.finalizeLeagueSeason(state, {
    ...env,
    simulateGame() { throw new Error('已完成总决赛不得重模拟'); },
    getRoster: () => roster,
    playerName: () => '玩家'
  });
  assert.equal(finale.finalsMvp.name, '真实队友', '禁赛、伤停和 DNP 场次的虚拟用户行必须排除');
  assert.equal(finale.finalsMvp.boxEvidence.actualUserGames, 3, '用户实际出场数应只统计真实出场');
  assert.equal(finale.finalsMvp.boxEvidence.complete, true, '全系列 box 完整时可以覆盖旧阈值 FMVP');
  assert.equal(finale.finalsMvp.boxEvidence.canOverrideExistingUser, true, '每场都能确认用户出场或 DNP 时证据才充分');
  assert.equal(state.season.awards.some(a => String(a.label || a).includes('总决赛MVP')), false, '完整实际证据选出队友后应移除旧用户 FMVP');
}

{
  const state = earlyEliminationState();
  state.season.playoffBracket.results.push(
    { round: 1, seriesIdx: 0, teamA: 'P8', teamB: 'P4', winner: 'P8', isMySeries: false },
    { round: 2, seriesIdx: 0, teamA: 'P8', teamB: 'P2', winner: 'P8', isMySeries: false },
    { round: 3, seriesIdx: 0, teamA: 'P8', teamB: 'O1', winner: 'P8', isMySeries: false }
  );
  state.season.playoffBracket.confChampion = 'P8';
  assert.equal(api.getPlayerPlayoffResultLabel(state, 1), '🏀 首轮 · 淘汰', '补赛后仍应显示玩家最后一轮真实结果');
}

{
  const snapshot = {
    careerTeam: 'AAA',
    teams: {
      AAA: [
        { key: 'id:1', name: '留下', nameEN: 'Stay', pos: 'PG', ovr: 80, team: 'AAA' },
        { key: 'id:2', name: '离开', nameEN: 'Leave', pos: 'C', ovr: 78, team: 'AAA' }
      ],
      BBB: [{ key: 'id:3', name: '他队', nameEN: 'Elsewhere', pos: 'SF', ovr: 90, team: 'BBB' }]
    }
  };
  const finalData = {
    AAA: [
      { id: 1, name: 'Stay', cname: '留下', pos: 'PG', ovr: 81 },
      { id: 4, name: 'Join', cname: '加入', pos: 'SG', ovr: 82 }
    ],
    BBB: [{ id: 5, name: 'Noise', cname: '他队新援', pos: 'PF', ovr: 95 }]
  };
  const changes = {
    trades: [{ from: 'BBB', to: 'CCC', playerA: '他队交易' }, { from: 'AAA', to: 'DDD', playerA: '离开' }],
    freeSignings: [{ from: 'FA', to: 'BBB', name: '他队签约' }, { from: 'FA', to: 'AAA', name: '加入' }],
    retired: [{ team: 'BBB', name: '他队退役' }, { team: 'AAA', name: '老将' }]
  };
  const report = api.buildTeamRosterReport(snapshot, finalData, 'AAA', changes, 'AAA');
  assert.equal(report.beforeCount, 2);
  assert.equal(report.afterCount, 2);
  assert.deepEqual(Array.from(report.departed, p => p.name), ['离开']);
  assert.deepEqual(Array.from(report.joined, p => p.name), ['加入']);
  assert.equal(report.trades.length, 1);
  assert.equal(report.freeAgents.length, 1);
  assert.equal(report.retirements.length, 1);
}

{
  const state = {
    careerTeam: 'AAA', finalOVR: 95, _careerSaved: false,
    career: {
      seasonCount: 1, seasons: [{ seasonNum: 1, team: 'AAA', ovr: 91 }],
      honors: [{ seasonNum: 1, label: 'MVP' }], totalStats: { pts: 8000, games: 82 }, profile: {}, flags: {}
    },
    season: {
      playerStats: { pts: 2500, games: 82 },
      awards: [
        { label: '🏆 总冠军', isUser: true },
        { label: '🏆 总冠军', isUser: true },
        { label: '👑 总决赛MVP', isUser: true },
        { label: '他人MVP', isUser: false }
      ]
    }
  };
  const first = api.calculateLegacyScorePreview(state);
  const stateBefore = JSON.stringify(state);
  const second = api.calculateLegacyScorePreview(state);
  assert.deepEqual(second, first, '历史分重复预览必须确定且一致');
  assert.equal(JSON.stringify(state), stateBefore, '历史分预览不得修改存档状态');
  assert.equal(first.counts.championship, 1, '同季重复冠军奖项应去重');
  assert.equal(first.counts.fmvp, 1);
  assert.ok(first.added > 0);
}

{
  const old = { career: { seasons: [{ seasonNum: 1, team: 'AAA' }] }, season: {} };
  assert.doesNotThrow(() => api.normalizeLoadedState(old));
  assert.equal(old.season.leagueFinale, null);
  assert.equal(old.career.seasons[0].finalsSeriesSummary, '');
}

{
  const core = fs.readFileSync(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../nba-perfect-player.html', import.meta.url), 'utf8');
  const finish = core.match(/function finishOffseasonPipeline\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const contract = core.match(/function selectContractOption\(team, years\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(finish, /contract <= 0[\s\S]*showContractOffers\(\);[\s\S]*return;/, '合同到期必须先选队，不能被报告绕过');
  assert.match(contract, /finalizeOffseasonRosterReport[\s\S]*showOffseasonTeamReport\(showRosterReview\)/, '选队后必须按最终球队重建报告');
  assert.doesNotMatch(contract, /showOffSeasonModals/, '合同选择后不得恢复全联盟前20流水账');
  const myCard = core.match(/function renderMyCard\(isFinal\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(core, /PP_SEASON_REPORT\.getPlayerPlayoffResultLabel\(STATE, seed\)/, '结果页必须调用生产用户系列赛标签 helper');
  assert.match(myCard, /PP_SEASON_REPORT\.getPlayerPlayoffResultLabel\(STATE, seed\)/, 'My Card 必须复用同一玩家结果 helper');
  assert.doesNotMatch(myCard, /bracket\?\.results\?\.slice\(-1\)/, 'My Card 不得读取全联盟最后一条系列赛');
  assert.match(core, /playoffResult: playoffResult \|\| \(playerMadePlayoffBracket \? '季后赛' : '未晋级'\)/, '联盟收官生成的旁观者 bracket 不能把未晋级玩家误记为季后赛球员');
  ['leagueChampion:', 'finalsMvp:', 'finalsSeriesSummary:', 'legacyScore:', 'legacyScoreAdded:', 'historicalRank:'].forEach(field => {
    assert.ok(core.includes(field), `seasonRecord 应保存 ${field}`);
  });
  assert.match(html, /perfect-player-core\.js\?v=20260826-era-story-ui-v27/);
  assert.match(html, /perfect-player-season-report\.js\?v=20260826-season-report-v2/);
  assert.match(html, /perfect-player-season-report\.css\?v=20260826-season-report-v1/);
}

console.log('season report tests passed');
