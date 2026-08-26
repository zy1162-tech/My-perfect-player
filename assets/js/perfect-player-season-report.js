(function (global) {
  'use strict';

  var REPORT_VERSION = 1;
  var offseasonContinue = null;

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : (fallback || 0);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function displayName(player) {
    return String((player && (player.cname || player.nameCn || player.name)) || '未知球员');
  }

  function stablePlayerKey(player) {
    if (!player) return '';
    var explicit = player._playerId || player.playerId || player.id || player.uuid;
    if (explicit != null && explicit !== '') return 'id:' + String(explicit);
    var name = String(player.name || player.nameEN || player.cname || player.nameCn || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
    var birth = String(player.birthYear || player.born || player.dob || '');
    return 'name:' + name + (birth ? '|birth:' + birth : '');
  }

  function playerView(player, team) {
    return {
      key: stablePlayerKey(player), team: team || '',
      name: displayName(player), nameEN: String((player && (player.name || player.nameEN)) || ''),
      pos: String((player && (player.posCn || player.pos)) || '—'),
      ovr: Math.round(number(player && player.ovr, 0))
    };
  }

  function snapshotLeague(data, teams) {
    var out = {};
    (teams || Object.keys(data || {})).forEach(function (team) {
      if (!Array.isArray(data && data[team])) return;
      out[team] = data[team].map(function (player) { return playerView(player, team); });
    });
    return out;
  }

  function resultFor(bracket, round, seriesIdx) {
    var results = bracket && Array.isArray(bracket.results) ? bracket.results : [];
    for (var i = results.length - 1; i >= 0; i--) {
      if (number(results[i].round, -1) === round && number(results[i].seriesIdx, -1) === seriesIdx) return results[i];
    }
    return null;
  }

  function propagateWinner(bracket, round, seriesIdx, winner) {
    if (!bracket || !winner) return;
    if (round === 2) {
      bracket.confChampion = winner;
      return;
    }
    if (round < 0 || round > 1) return;
    var nextRound = bracket.rounds && bracket.rounds[round + 1];
    if (!nextRound) return;
    var nextIdx;
    var isHigh;
    if (round === 0) {
      nextIdx = (seriesIdx === 0 || seriesIdx === 3) ? 0 : 1;
      isHigh = seriesIdx === 0 || seriesIdx === 1;
    } else {
      nextIdx = 0;
      isHigh = seriesIdx === 0;
    }
    if (!nextRound[nextIdx]) nextRound[nextIdx] = { high:null, low:null, winner:null };
    if (isHigh) nextRound[nextIdx].high = { team:winner };
    else nextRound[nextIdx].low = { team:winner };
  }

  function simulateSeries(teamA, teamB, env) {
    var winsA = 0;
    var winsB = 0;
    var games = [];
    for (var game = 0; game < 7 && winsA < 4 && winsB < 4; game++) {
      var raw = env.simulateGame(teamA, teamB, game) || {};
      var aWon = raw.won != null ? !!raw.won : number(raw.scoreA) >= number(raw.scoreB);
      if (aWon) winsA++; else winsB++;
      games.push({
        game:game + 1, myScore:number(raw.scoreA), oppScore:number(raw.scoreB), won:aWon,
        home:!!raw.home, qScoresA:raw.qScoresA || null, qScoresB:raw.qScoresB || null,
        ot:number(raw.ot), boxScore:raw.boxScore || null
      });
    }
    var winner = winsA >= 4 ? teamA : teamB;
    return {
      teamA:teamA, teamB:teamB, winner:winner,
      winsA:winsA, winsB:winsB, aWon:winner === teamA,
      winnerWins:Math.max(winsA, winsB), loserWins:Math.min(winsA, winsB), seriesGames:games
    };
  }

  function completeConferenceBracket(bracket, env) {
    if (!bracket || !Array.isArray(bracket.rounds)) return '';
    // 已有分区冠军就是已完成季后赛的事实源；旧档可能没有保存每轮完整明细，
    // 此时不能为了补明细重抽整条晋级路径。
    if (bracket.confChampion) return bracket.confChampion;
    if (!Array.isArray(bracket.results)) bracket.results = [];
    for (var round = 0; round < 3; round++) {
      var seriesList = bracket.rounds[round] || [];
      for (var idx = 0; idx < seriesList.length; idx++) {
        var series = seriesList[idx];
        if (!series) continue;
        var existing = resultFor(bracket, round, idx);
        if (series.winner || (existing && existing.winner)) {
          series.winner = series.winner || existing.winner;
          propagateWinner(bracket, round, idx, series.winner);
          continue;
        }
        var teamA = series.high && series.high.team;
        var teamB = series.low && series.low.team;
        if (!teamA || !teamB) continue;
        var result = simulateSeries(teamA, teamB, env);
        result.round = round;
        result.seriesIdx = idx;
        result.roundName = ['首轮','分区半决赛','分区决赛'][round];
        result.isMySeries = false;
        series.winner = result.winner;
        bracket.results.push(result);
        propagateWinner(bracket, round, idx, result.winner);
      }
      bracket.currentRound = Math.max(number(bracket.currentRound), Math.min(3, round + 1));
    }
    return bracket.confChampion || '';
  }

  function lineKey(line) {
    return String((line && (line.nameEN || line.name)) || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
  }

  function findRosterPlayer(roster, line) {
    var key = lineKey(line);
    for (var i = 0; i < (roster || []).length; i++) {
      var player = roster[i];
      if (lineKey({ name:player.name }) === key || lineKey({ name:player.cname }) === key) return player;
    }
    return null;
  }

  function getSimulationRoster(team) {
    if (typeof calcTeamLineup === 'function') {
      try {
        var lineup = calcTeamLineup(team) || {};
        var rotation = Object.keys(lineup.starters || {}).map(function (pos) { return lineup.starters[pos]; })
          .concat(Array.isArray(lineup.bench) ? lineup.bench : []).filter(Boolean);
        var seen = [];
        rotation = rotation.filter(function (player) {
          if (seen.indexOf(player) >= 0) return false;
          seen.push(player);
          return true;
        });
        if (rotation.length) return rotation;
      } catch (error) {}
    }
    return (typeof NBA2K_DATA !== 'undefined' && Array.isArray(NBA2K_DATA[team])) ? NBA2K_DATA[team] : [];
  }

  function gameMarksUserDnp(game) {
    if (!game) return false;
    return !!(game.suspended || game.dnp || game.didNotPlay || game.userDnp ||
      game.skipReason === 'suspension' || game.skipReason === 'injury');
  }

  function lineMarksDnp(line) {
    return !!(line && (line.dnp || line.didNotPlay || line.inactive || line.status === 'DNP' ||
      (line.mins != null && number(line.mins) <= 0)));
  }

  function isUserBoxLine(line, roster, userName) {
    var player = findRosterPlayer(roster, line);
    return !!(line && line.isUser) || !!(player && player._isUser) || (!!userName && String(line && line.name || '') === userName);
  }

  function selectFinalsMvp(finalsResult, champion, roster, userName) {
    var totals = {};
    var seriesGames = finalsResult && finalsResult.seriesGames || [];
    var boxGames = 0;
    var actualUserGames = 0;
    var accountedUserGames = 0;
    seriesGames.forEach(function (game) {
      var lines = game && game.boxScore && game.boxScore[champion];
      if (!Array.isArray(lines)) return;
      if (lines.length) boxGames++;
      var userAccountedThisGame = gameMarksUserDnp(game);
      lines.forEach(function (line) {
        var isUser = isUserBoxLine(line, roster, userName);
        if (isUser) userAccountedThisGame = true;
        if (lineMarksDnp(line) || (isUser && gameMarksUserDnp(game))) return;
        var key = lineKey(line);
        if (!key) return;
        var row = totals[key] || (totals[key] = {
          name:String(line.name || '未知球员'), nameEN:String(line.nameEN || ''), isUser:isUser,
          games:0, pts:0, reb:0, ast:0, fgm:0, fga:0, ftm:0, fta:0
        });
        row.games++;
        if (isUser) actualUserGames++;
        ['pts','reb','ast','fgm','fga','ftm','fta'].forEach(function (field) { row[field] += number(line[field]); });
        row.isUser = row.isUser || isUser;
      });
      if (userAccountedThisGame) accountedUserGames++;
    });
    var candidates = Object.keys(totals).map(function (key) {
      var row = totals[key];
      var player = findRosterPlayer(roster, row);
      row.ovr = Math.round(number(player && player.ovr));
      row.nameEN = row.nameEN || String((player && player.name) || '');
      row.isUser = row.isUser || !!(player && player._isUser) || (!!userName && row.name === userName);
      row.ppg = row.games ? row.pts / row.games : 0;
      row.rpg = row.games ? row.reb / row.games : 0;
      row.apg = row.games ? row.ast / row.games : 0;
      row.efficiency = row.fga > 0 ? row.pts / (2 * (row.fga + 0.44 * row.fta)) : 0;
      return row;
    });
    candidates.sort(function (a, b) {
      return (b.pts - a.pts) || (b.ppg - a.ppg) || ((b.reb * 0.35 + b.ast * 0.5) - (a.reb * 0.35 + a.ast * 0.5)) ||
        (b.efficiency - a.efficiency) || (b.ovr - a.ovr) || a.name.localeCompare(b.name, 'zh-CN');
    });
    var evidence = {
      totalGames:seriesGames.length, boxGames:boxGames, actualUserGames:actualUserGames, accountedUserGames:accountedUserGames,
      complete:seriesGames.length >= 4 && boxGames === seriesGames.length,
      canOverrideExistingUser:seriesGames.length >= 4 && boxGames === seriesGames.length && accountedUserGames === seriesGames.length
    };
    if (candidates.length) {
      candidates[0].boxEvidence = evidence;
      return candidates[0];
    }
    var fallback = (roster || []).slice().sort(function (a, b) {
      return number(b.ovr) - number(a.ovr) || displayName(a).localeCompare(displayName(b), 'zh-CN');
    })[0];
    if (!fallback) return { name:'数据缺失', nameEN:'', isUser:false, ppg:null, rpg:null, apg:null, efficiency:null, ovr:0, games:0, fallback:true, boxEvidence:evidence };
    return {
      name:displayName(fallback), nameEN:String(fallback.name || ''), isUser:!!fallback._isUser || displayName(fallback) === userName,
      ppg:null, rpg:null, apg:null, efficiency:null, ovr:Math.round(number(fallback.ovr)), games:0, fallback:true, boxEvidence:evidence
    };
  }

  function hasExistingUserFmvp(state) {
    var season = state.season || {};
    if (season.finalsMvp && season.finalsMvp.isUser) return true;
    return !!(Array.isArray(season.awards) && season.awards.some(function (award) {
      var label = typeof award === 'string' ? award : String((award && award.label) || '');
      var isUser = typeof award === 'string' || !!(award && award.isUser);
      return isUser && (label.indexOf('总决赛MVP') >= 0 || label.indexOf('FMVP') >= 0);
    }));
  }

  function preserveExistingUserMvp(mvp, roster, playerName) {
    var user = (roster || []).filter(function (player) { return player && player._isUser; })[0];
    return {
      name:playerName, nameEN:String(user && user.name || ''), isUser:true,
      ppg:null, rpg:null, apg:null, efficiency:null, ovr:Math.round(number(user && user.ovr)), games:0,
      fallback:true, preservedExisting:true, boxEvidence:mvp && mvp.boxEvidence || { totalGames:0, boxGames:0, actualUserGames:0, accountedUserGames:0, complete:false, canOverrideExistingUser:false }
    };
  }

  function getPlayerPlayoffResultLabel(state, seed) {
    state = state || {};
    var season = state.season || {};
    var bracket = season.playoffBracket;
    var team = state.careerTeam;
    var results = bracket && Array.isArray(bracket.results) ? bracket.results : [];
    var madeBracket = !!(bracket && Array.isArray(bracket.teams) && bracket.teams.some(function (entry) { return entry && entry.team === team; }));
    if (season.isChampion) return '🏆 总冠军';
    if (bracket && bracket.confChampion === team) {
      var finals = results.filter(function (result) { return result && result.round === 3 && (result.teamA === team || result.teamB === team); }).slice(-1)[0];
      if (!finals) return '🏀 总决赛';
      return finals.winner === team ? '🏆 总冠军' : '🏀 总决赛 亚军';
    }
    if (madeBracket) {
      var userSeries = results.filter(function (result) {
        return result && (result.isMySeries || result.teamA === team || result.teamB === team);
      });
      var lastUserSeries = userSeries[userSeries.length - 1];
      if (lastUserSeries) {
        var roundName = ['首轮','分区半决赛','分区决赛','总决赛'][lastUserSeries.round] || '季后赛';
        return '🏀 ' + roundName + ' · ' + (lastUserSeries.winner === team ? '晋级' : '淘汰');
      }
      return '🏀 第' + seed + '种子 · 季后赛';
    }
    if (number(seed, 99) <= 10) {
      var playIn = season.playInState;
      if (playIn && playIn.isEliminated) return '🔥 附加赛 · 淘汰';
      if (playIn && playIn.playoffSeed) return '🔥 附加赛晋级（' + playIn.playoffSeed + '号种子）';
      return '🔥 附加赛';
    }
    return '😢 未进季后赛';
  }

  function teamName(env, team) {
    return env.teamName ? env.teamName(team) : team;
  }

  function findCompletedFinals(state) {
    var season = state.season || {};
    var brackets = [season.playoffBracket, season.otherBracket];
    for (var i = 0; i < brackets.length; i++) {
      var bracket = brackets[i];
      var result = resultFor(bracket, 3, 0);
      if (result && result.winner) return { bracket:bracket, result:result };
    }
    return null;
  }

  function bracketHasTeam(bracket, team) {
    return !!(bracket && Array.isArray(bracket.teams) && bracket.teams.some(function (entry) { return entry && entry.team === team; }));
  }

  function dedupePlayerFinalAwards(state, finale) {
    var season = state.season || {};
    var awards = Array.isArray(season.awards) ? season.awards : [];
    var kept = [];
    var championSeen = false;
    for (var i = 0; i < awards.length; i++) {
      var award = awards[i];
      var label = typeof award === 'string' ? award : String((award && award.label) || '');
      var isUser = typeof award === 'string' || !!(award && award.isUser);
      if (!isUser || (label.indexOf('总冠军') < 0 && label.indexOf('总决赛MVP') < 0 && label.indexOf('FMVP') < 0)) {
        kept.push(award);
        continue;
      }
      if (label.indexOf('总冠军') >= 0 && finale.isPlayerChampion && !championSeen) {
        kept.push(award); championSeen = true;
      }
    }
    if (finale.isPlayerChampion && !championSeen) {
      kept.push({ act:'champion', label:'🏆 总冠军', winner:finale.playerName, winnerEN:'', team:state.careerTeam, isUser:true });
    }
    if (finale.isPlayerFmvp) {
      kept.push({ act:'fmvp', label:'👑 总决赛MVP', winner:finale.playerName, winnerEN:'', team:state.careerTeam, isUser:true });
    }
    season.awards = kept;
  }

  function finalizeLeagueSeason(state, env) {
    state = state || {};
    var season = state.season || (state.season = {});
    if (season.leagueFinale && season.leagueFinale.complete) return season.leagueFinale;
    var primary = season.playoffBracket;
    var other = season.otherBracket;
    if (!primary || !other) return null;

    var existingFinals = findCompletedFinals(state);
    var championA;
    var championB;
    if (existingFinals) {
      // 总决赛本身已完成时，两支参赛队已经是最高优先级事实源。
      // 旧档即便缺少前轮明细，也不得为了补图重新模拟并产生另一组分区冠军。
      var savedFinals = existingFinals.result;
      championA = bracketHasTeam(primary, savedFinals.teamA) ? savedFinals.teamA : savedFinals.teamB;
      championB = championA === savedFinals.teamA ? savedFinals.teamB : savedFinals.teamA;
      primary.confChampion = primary.confChampion || championA;
      other.confChampion = other.confChampion || championB;
    } else {
      championA = completeConferenceBracket(primary, env);
      championB = completeConferenceBracket(other, env);
    }
    if (!championA || !championB) return null;
    primary.otherConfChampion = championB;
    if (!primary.rounds[3]) primary.rounds[3] = [null];
    if (!primary.rounds[3][0]) primary.rounds[3][0] = { high:{team:championA}, low:{team:championB}, winner:null };

    var finals = existingFinals && existingFinals.result;
    if (!finals) {
      finals = simulateSeries(championA, championB, env);
      finals.round = 3;
      finals.seriesIdx = 0;
      finals.roundName = '总决赛';
      finals.isMySeries = championA === state.careerTeam || championB === state.careerTeam;
      primary.results.push(finals);
    }
    primary.rounds[3][0].winner = finals.winner;
    primary.currentRound = 3;
    var champion = finals.winner;
    var runnerUp = champion === finals.teamA ? finals.teamB : finals.teamA;
    var roster = env.getRoster ? env.getRoster(champion) : [];
    var playerName = env.playerName ? env.playerName() : '我的球员';
    var mvp = selectFinalsMvp(finals, champion, roster, playerName);
    if (champion === state.careerTeam && hasExistingUserFmvp(state) && !(mvp.boxEvidence && mvp.boxEvidence.canOverrideExistingUser)) {
      // 旧版已经结算的用户 FMVP 是明确事实；只有完整总决赛 box 才足以推翻它。
      mvp = preserveExistingUserMvp(mvp, roster, playerName);
    }
    mvp.team = champion;
    var finale = {
      version:REPORT_VERSION, complete:true, champion:champion, championName:teamName(env, champion),
      runnerUp:runnerUp, runnerUpName:teamName(env, runnerUp),
      finalsMvp:mvp, finalsSeriesSummary:teamName(env, champion) + ' ' + number(finals.winnerWins, 4) + '-' + number(finals.loserWins, 0) + ' ' + teamName(env, runnerUp),
      isPlayerChampion:champion === state.careerTeam,
      isPlayerFmvp:champion === state.careerTeam && !!mvp.isUser, playerName:playerName
    };
    season.leagueFinale = finale;
    season.leagueChampion = champion;
    season.finalsMvp = clone(mvp);
    season.finalsSeriesSummary = finale.finalsSeriesSummary;
    season.isChampion = finale.isPlayerChampion;
    season.playoffsDone = true;
    dedupePlayerFinalAwards(state, finale);
    return finale;
  }

  function ensureLeagueFinale() {
    if (typeof STATE === 'undefined' || !STATE || !STATE.season) return null;
    if (STATE.season.leagueFinale && STATE.season.leagueFinale.complete) return STATE.season.leagueFinale;
    if (!STATE.season.playoffBracket || !STATE.season.otherBracket) {
      if (typeof buildPlayoffBracket !== 'function' || typeof autoSimConferenceBracket !== 'function') return null;
      var userConf = typeof getConference === 'function' ? getConference(STATE.careerTeam) : 'EAST';
      var otherConf = userConf === 'EAST' ? 'WEST' : 'EAST';
      var primary = STATE.season.playoffBracket || buildPlayoffBracket(userConf, STATE.season.playInState);
      var other = STATE.season.otherBracket || buildPlayoffBracket(otherConf);
      if (!primary.confChampion && (!primary.results || !primary.results.length)) autoSimConferenceBracket(primary);
      if (!other.confChampion) autoSimConferenceBracket(other);
      STATE.season.playoffBracket = primary;
      STATE.season.otherBracket = other;
    }
    var env = {
      simulateGame:function (teamA, teamB, game) {
        var ctx = typeof getPlayoffSeriesGameContext === 'function' ? getPlayoffSeriesGameContext(teamA, teamB, game) : { seedBonus:0, teamAHome:game === 0 || game === 1 || game === 4 || game === 6 };
        var result = simulateGameNew(teamA, teamB, ctx.seedBonus, null, { teamAHome:ctx.teamAHome, isPlayoff:true });
        result.home = ctx.teamAHome;
        return result;
      },
      teamName:function (team) { return typeof getTeamName === 'function' ? getTeamName(team) : team; },
      getRoster:getSimulationRoster,
      playerName:function () { return typeof getHupuDisplayName === 'function' ? getHupuDisplayName() : '我的球员'; }
    };
    var finale = finalizeLeagueSeason(STATE, env);
    if (finale && typeof autoSaveGame === 'function') autoSaveGame();
    return finale;
  }

  function honorLabel(honor) {
    return String(typeof honor === 'string' ? honor : (honor && (honor.userHonorLabel || honor.label)) || '');
  }

  function honorCategory(label) {
    if (label.indexOf('总冠军') >= 0) return 'championship';
    if (label.indexOf('总决赛MVP') >= 0 || label.indexOf('FMVP') >= 0) return 'fmvp';
    if (label === 'MVP' || /(^|[^F])MVP/.test(label)) return 'mvp';
    if (label.indexOf('DPOY') >= 0 || label.indexOf('最佳防守球员') >= 0) return 'dpoy';
    if (label.indexOf('最佳阵容') >= 0) return 'allNBA';
    if (label.indexOf('全明星') >= 0) return 'allStar';
    return '';
  }

  function historicalRank(score, goat) {
    score = Math.max(0, number(score));
    if (goat) return 1;
    if (score >= 220) return 2;
    if (score >= 180) return 3 + Math.round((219 - Math.min(219, score)) / 39 * 7);
    if (score >= 155) return 11 + Math.round((179 - score) / 24 * 9);
    if (score >= 140) return 21 + Math.round((154 - score) / 14 * 79);
    return 101 + Math.round((139 - Math.min(139, score)) / 139 * 49);
  }

  function tierFor(score, goat) {
    if (goat) return 'GOAT级别';
    if (score >= 180) return '历史前十级别';
    if (score >= 155) return '历史前二十级别';
    if (score >= 140) return 'NBA历史百大';
    if (score >= 100) return '名人堂稳进';
    if (score >= 75) return '名人堂边缘';
    if (score >= 60) return '队史传奇';
    return '优秀职业球员';
  }

  function nextLegacyTarget(score) {
    var targets = [
      { score:60, label:'队史传奇' }, { score:75, label:'名人堂边缘' }, { score:100, label:'名人堂稳进' },
      { score:140, label:'NBA历史百大' }, { score:155, label:'历史前二十' }, { score:180, label:'历史前十' }, { score:220, label:'历史第二档' }
    ];
    for (var i = 0; i < targets.length; i++) {
      if (score < targets[i].score) return { label:targets[i].label, gap:targets[i].score - score, score:targets[i].score };
    }
    return { label:'GOAT条件', gap:0, score:score };
  }

  function seasonHonorRows(state, includeCurrent) {
    var career = state.career || {};
    var currentSeasonNum = state._careerSaved ? number(career.seasonCount) : number(career.seasonCount) + 1;
    var rows = [];
    (career.honors || []).forEach(function (honor) {
      var seasonNum = number(honor && honor.seasonNum);
      if (!includeCurrent && state._careerSaved && seasonNum === currentSeasonNum) return;
      rows.push({ seasonNum:seasonNum, label:honorLabel(honor) });
    });
    if (includeCurrent && !state._careerSaved) {
      (state.season && state.season.awards || []).forEach(function (award) {
        if (typeof award === 'object' && !award.isUser) return;
        rows.push({ seasonNum:currentSeasonNum, label:honorLabel(award) });
      });
    }
    var seen = {};
    return rows.filter(function (row) {
      var category = honorCategory(row.label);
      if (!category) return false;
      var key = row.seasonNum + '|' + category;
      if (seen[key]) return false;
      seen[key] = true;
      row.category = category;
      return true;
    });
  }

  function scoreLegacyState(state, includeCurrent) {
    state = state || {};
    var career = state.career || {};
    var seasons = (career.seasons || []).slice();
    var total = Object.assign({}, career.totalStats || {});
    if (!includeCurrent && state._careerSaved && seasons.length) {
      var latest = seasons[seasons.length - 1];
      var latestStats = latest.playerStats || {};
      total.pts = Math.max(0, number(total.pts) - number(latestStats.pts));
      total.games = Math.max(0, number(total.games) - number(latestStats.games));
      seasons.pop();
    } else if (includeCurrent && !state._careerSaved && state.season) {
      total.pts = number(total.pts) + number(state.season.playerStats && state.season.playerStats.pts);
      total.games = number(total.games) + number(state.season.playerStats && state.season.playerStats.games);
      seasons.push({ team:state.careerTeam, ovr:state.finalOVR, seasonNum:number(career.seasonCount) + 1 });
    }
    var counts = { championship:0, fmvp:0, mvp:0, dpoy:0, allNBA:0, allStar:0 };
    seasonHonorRows(state, includeCurrent).forEach(function (row) { counts[row.category]++; });
    var recordedChampionships = seasons.filter(function (season) {
      return String(season.playoffResult || '').indexOf('总冠军') >= 0 || (!!season.leagueChampion && season.leagueChampion === season.team);
    }).length;
    counts.championship = Math.max(counts.championship, recordedChampionships);
    var teamYears = {};
    var peak = 0;
    seasons.forEach(function (season) {
      if (season.team) teamYears[season.team] = (teamYears[season.team] || 0) + 1;
      peak = Math.max(peak, number(season.ovr));
    });
    if (includeCurrent && !state._careerSaved) peak = Math.max(peak, number(state.finalOVR));
    var longestYears = Object.keys(teamYears).reduce(function (best, team) { return Math.max(best, teamYears[team]); }, 0);
    var breakdown = {
      championships:counts.championship * 18, fmvp:counts.fmvp * 14, mvp:counts.mvp * 16,
      dpoy:counts.dpoy * 10, allNBA:counts.allNBA * 5, allStar:counts.allStar * 3,
      points:Math.min(35, Math.floor(number(total.pts) / 2500)), games:Math.min(18, Math.floor(number(total.games) / 120)),
      loyalty:longestYears >= 8 ? 10 : 0, peak:peak >= 94 ? 8 : 0,
      profile:Math.max(-15, Math.min(20, Math.round(number(career.profile && career.profile.legacyBonus)))),
      farewell:0
    };
    var flags = career.flags || {};
    breakdown.farewell = (flags.finalShow ? 2 : 0) - (flags.finalHurt ? 1 : 0) + (flags.farewellHomeTeam ? 3 : 0) + (flags.countdownLegend ? 2 : 0);
    var score = Object.keys(breakdown).reduce(function (sum, key) { return sum + breakdown[key]; }, 0);
    var goat = counts.mvp >= 5 && counts.championship >= 6 && counts.fmvp >= 6 && (counts.mvp + counts.championship + counts.fmvp) >= 18;
    return {
      score:score, tier:tierFor(score, goat), historicalRank:historicalRank(score, goat), nextTarget:nextLegacyTarget(score),
      counts:counts, breakdown:breakdown, points:number(total.pts), games:number(total.games), longestYears:longestYears, peak:peak, goat:goat
    };
  }

  function calculateLegacyScorePreview(state) {
    state = state || (typeof STATE !== 'undefined' ? STATE : {});
    var before = scoreLegacyState(state, false);
    var current = scoreLegacyState(state, true);
    current.added = current.score - before.score;
    current.previousScore = before.score;
    return current;
  }

  function renderLeagueFinaleCard(finale) {
    finale = finale || ensureLeagueFinale();
    if (!finale) return '<div class="sr-section season-report-card"><div class="sr-section-title">🏆 联盟收官</div><div class="season-report-empty">旧赛季缺少完整季后赛数据，无法还原联盟冠军。</div></div>';
    var mvp = finale.finalsMvp || {};
    var stat = mvp.preservedExisting ? '沿用已完成赛季的 FMVP 记录' :
      (mvp.ppg == null ? '旧数据确定性兜底' : (mvp.ppg.toFixed(1) + '分 · ' + mvp.rpg.toFixed(1) + '板 · ' + mvp.apg.toFixed(1) + '助'));
    return '<div class="sr-section season-report-card league-finale-card' + (finale.isPlayerChampion ? ' is-player-champion' : '') + '">' +
      '<div class="sr-section-title">🏆 联盟收官</div>' +
      '<div class="season-report-title">' + escapeHtml(finale.championName) + '夺得总冠军</div>' +
      '<div class="season-report-series">' + escapeHtml(finale.finalsSeriesSummary) + '</div>' +
      '<div class="season-report-mvp' + (finale.isPlayerFmvp ? ' is-player' : '') + '"><span>总决赛 MVP</span><strong>' + escapeHtml(mvp.name) + '</strong><small>' + escapeHtml(stat) + '</small></div>' +
      (finale.isPlayerChampion ? '<div class="season-report-highlight">这是属于你的冠军赛季' + (finale.isPlayerFmvp ? ' · 你同时当选 FMVP' : '') + '</div>' : '') +
      '</div>';
  }

  function renderLegacyScoreCard(preview) {
    preview = preview || calculateLegacyScorePreview();
    var next = preview.nextTarget || {};
    return '<div class="sr-section season-report-card legacy-preview-card">' +
      '<div class="sr-section-title">📜 历史荣誉分</div>' +
      '<div class="legacy-preview-grid"><div><strong>' + preview.score + '</strong><span>生涯累计</span></div><div><strong>' + (preview.added >= 0 ? '+' : '') + preview.added + '</strong><span>本赛季新增</span></div><div><strong>第 ' + preview.historicalRank + ' 名</strong><span>模拟历史排名</span></div></div>' +
      '<div class="legacy-preview-footer"><span>' + escapeHtml(preview.tier) + '</span><span>' + (next.gap > 0 ? '距“' + escapeHtml(next.label) + '”还差 ' + next.gap + ' 分' : '已进入最高目标区间') + '</span></div>' +
      '<small class="legacy-preview-note">游戏内模拟评价，不是联网排行榜；重复查看不会增加分数。</small></div>';
  }

  function renderHistoricalSeasonFragment(record) {
    if (!record) return '';
    var finale = record.leagueChampion || record.finalsSeriesSummary || record.finalsMvp;
    var finaleHtml = finale ? '<div class="season-detail-report"><b>🏆 联盟收官</b><span>' + escapeHtml(record.finalsSeriesSummary || ((record.leagueChampionName || record.leagueChampion) + '夺冠')) + '</span><small>FMVP：' + escapeHtml((record.finalsMvp && record.finalsMvp.name) || record.finalsMvp || '旧记录缺失') + '</small></div>' : '<div class="season-detail-report is-muted">旧赛季未保存联盟收官详情</div>';
    var legacyHtml = record.legacyScore == null ? '<div class="season-detail-report is-muted">旧赛季未保存历史荣誉分</div>' : '<div class="season-detail-report"><b>📜 历史荣誉分 ' + number(record.legacyScore) + '</b><span>本季 +' + number(record.legacyScoreAdded) + ' · 模拟历史第 ' + number(record.historicalRank, 150) + ' 名</span></div>';
    return finaleHtml + legacyHtml;
  }

  function captureOffseasonRosterSnapshot() {
    if (typeof STATE === 'undefined' || typeof NBA2K_DATA === 'undefined') return null;
    var teams = typeof NBA2K_TEAMS !== 'undefined' && Array.isArray(NBA2K_TEAMS) ? NBA2K_TEAMS : Object.keys(NBA2K_DATA);
    var snapshot = {
      version:REPORT_VERSION, seasonNum:number(STATE.career && STATE.career.seasonCount), careerTeam:STATE.careerTeam,
      teams:snapshotLeague(NBA2K_DATA, teams)
    };
    STATE._offseasonRosterSnapshot = snapshot;
    delete STATE._offseasonRosterReport;
    return snapshot;
  }

  function movementTouchesTeam(move, team) {
    return !!move && (move.from === team || move.to === team || move.team === team);
  }

  function buildTeamRosterReport(snapshot, finalData, finalTeam, changes, oldTeam) {
    snapshot = snapshot || { teams:{} };
    changes = changes || {};
    function teamDiff(team) {
      var before = (snapshot.teams && snapshot.teams[team]) || [];
      var after = snapshotLeague(finalData || {}, [team])[team] || [];
      var beforeMap = {};
      var afterMap = {};
      before.forEach(function (p) { beforeMap[p.key] = p; });
      after.forEach(function (p) { afterMap[p.key] = p; });
      return {
        team:team, beforeCount:before.length, afterCount:after.length,
        departed:before.filter(function (p) { return !afterMap[p.key]; }),
        joined:after.filter(function (p) { return !beforeMap[p.key]; })
      };
    }
    var mainDiff = teamDiff(finalTeam);
    var previousTeam = oldTeam || snapshot.careerTeam || finalTeam;
    var retirements = (changes.retired || []).filter(function (move) { return move.team === finalTeam; });
    var freeAgents = (changes.freeSignings || []).filter(function (move) { return movementTouchesTeam(move, finalTeam); });
    var trades = (changes.trades || []).filter(function (move) { return movementTouchesTeam(move, finalTeam); });
    return {
      version:REPORT_VERSION, team:finalTeam, oldTeam:previousTeam,
      beforeCount:mainDiff.beforeCount, afterCount:mainDiff.afterCount, departed:mainDiff.departed, joined:mainDiff.joined,
      previousTeamDiff:previousTeam !== finalTeam ? teamDiff(previousTeam) : null,
      trades:clone(trades), freeAgents:clone(freeAgents), retirements:clone(retirements)
    };
  }

  function finalizeOffseasonRosterReport() {
    if (typeof STATE === 'undefined' || typeof NBA2K_DATA === 'undefined') return null;
    var snapshot = STATE._offseasonRosterSnapshot || captureOffseasonRosterSnapshot();
    var report = buildTeamRosterReport(snapshot, NBA2K_DATA, STATE.careerTeam, STATE._leagueChanges || {}, snapshot && snapshot.careerTeam);
    STATE._offseasonRosterReport = report;
    return report;
  }

  function renderRosterPerson(person, kind) {
    var headshot = '';
    if (typeof getPlayerHeadshotStyle === 'function') {
      var style = getPlayerHeadshotStyle(person.nameEN || person.name, 30);
      if (style) headshot = '<span class="offseason-player-headshot" style="' + escapeHtml(style) + '"></span>';
    }
    return '<div class="offseason-player-row">' + headshot + '<span class="offseason-player-kind">' + kind + '</span><span class="offseason-player-pos">' + escapeHtml(person.pos || '—') + '</span><strong>' + escapeHtml(person.name) + '</strong><span class="offseason-player-ovr">OVR ' + number(person.ovr) + '</span></div>';
  }

  function showOffseasonTeamReport(done) {
    if (typeof document === 'undefined' || typeof STATE === 'undefined') return false;
    var report = STATE._offseasonRosterReport || finalizeOffseasonRosterReport();
    if (!report) return false;
    offseasonContinue = typeof done === 'function' ? done : null;
    var teamLabel = typeof getTeamName === 'function' ? getTeamName(report.team) : report.team;
    var rows = '';
    report.departed.forEach(function (p) { rows += renderRosterPerson(p, '离开'); });
    report.joined.forEach(function (p) { rows += renderRosterPerson(p, '加入'); });
    if (!rows) rows = '<div class="season-report-empty">本队休赛期名单没有变化，核心阵容保持稳定。</div>';
    var relevant = [];
    report.trades.forEach(function (move) { relevant.push('交易：' + (move.playerA || '') + (move.playerB ? ' / ' + move.playerB : '')); });
    report.freeAgents.forEach(function (move) { relevant.push('自由球员：' + (move.name || '')); });
    report.retirements.forEach(function (move) { relevant.push('退役：' + (move.name || '')); });
    var detail = relevant.length ? '<div class="offseason-move-notes">' + relevant.map(function (line) { return '<span>' + escapeHtml(line) + '</span>'; }).join('') + '</div>' : '';
    var overlay = document.createElement('div');
    overlay.className = 'team-picker-overlay';
    overlay.id = 'offseason-team-report';
    var oldTeamHtml = '';
    if (report.previousTeamDiff) {
      var oldLabel = typeof getTeamName === 'function' ? getTeamName(report.oldTeam) : report.oldTeam;
      oldTeamHtml = '<div class="season-report-highlight">你已从 ' + escapeHtml(oldLabel) + ' 加入本队 · 老东家名单 ' + report.previousTeamDiff.beforeCount + '→' + report.previousTeamDiff.afterCount + '</div>';
    }
    overlay.innerHTML = '<div class="team-picker-modal offseason-team-report-modal"><div class="team-picker-header"><span>🔥 ' + escapeHtml(teamLabel) + ' · 休赛期报告</span></div><div class="offseason-team-report-body"><div class="offseason-counts"><strong>' + report.beforeCount + '</strong><span>上季人数</span><b>→</b><strong>' + report.afterCount + '</strong><span>新季人数</span></div>' + oldTeamHtml + rows + detail + '</div><div class="offseason-report-actions"><button class="btn btn-ghost btn-sm" id="offseason-view-roster">查看新赛季阵容</button><button class="btn btn-primary btn-sm" id="offseason-report-continue">继续</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#offseason-view-roster').onclick = function () {
      if (typeof showCurrentTeamRoster === 'function') showCurrentTeamRoster();
      else if (typeof showRosterReview === 'function') showRosterReview();
    };
    overlay.querySelector('#offseason-report-continue').onclick = function () {
      overlay.remove();
      var callback = offseasonContinue;
      offseasonContinue = null;
      delete STATE._offseasonRosterSnapshot;
      delete STATE._offseasonRosterReport;
      if (callback) callback();
    };
    return true;
  }

  function normalizeLoadedState(state) {
    state = state || {};
    if (!state.season) state.season = {};
    if (state.season.leagueFinale === undefined) state.season.leagueFinale = null;
    if (state.season.leagueChampion === undefined) state.season.leagueChampion = null;
    if (state.season.finalsMvp === undefined) state.season.finalsMvp = null;
    if (state.season.finalsSeriesSummary === undefined) state.season.finalsSeriesSummary = '';
    if (state.career) {
      if (!Array.isArray(state.career.seasons)) state.career.seasons = [];
      state.career.seasons.forEach(function (record) {
        if (record.leagueChampion === undefined) record.leagueChampion = null;
        if (record.finalsMvp === undefined) record.finalsMvp = null;
        if (record.finalsSeriesSummary === undefined) record.finalsSeriesSummary = '';
      });
    }
    return state;
  }

  global.PP_SEASON_REPORT = {
    ensureLeagueFinale:ensureLeagueFinale,
    calculateLegacyScorePreview:calculateLegacyScorePreview,
    renderLeagueFinaleCard:renderLeagueFinaleCard,
    renderLegacyScoreCard:renderLegacyScoreCard,
    renderHistoricalSeasonFragment:renderHistoricalSeasonFragment,
    captureOffseasonRosterSnapshot:captureOffseasonRosterSnapshot,
    finalizeOffseasonRosterReport:finalizeOffseasonRosterReport,
    showOffseasonTeamReport:showOffseasonTeamReport,
    normalizeLoadedState:normalizeLoadedState,
    getPlayerPlayoffResultLabel:getPlayerPlayoffResultLabel,
    _test:{
      stablePlayerKey:stablePlayerKey, snapshotLeague:snapshotLeague, simulateSeries:simulateSeries,
      completeConferenceBracket:completeConferenceBracket, selectFinalsMvp:selectFinalsMvp,
      getSimulationRoster:getSimulationRoster, getPlayerPlayoffResultLabel:getPlayerPlayoffResultLabel,
      finalizeLeagueSeason:finalizeLeagueSeason, scoreLegacyState:scoreLegacyState,
      calculateLegacyScorePreview:calculateLegacyScorePreview, buildTeamRosterReport:buildTeamRosterReport,
      normalizeLoadedState:normalizeLoadedState
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
