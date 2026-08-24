/* Perfect Player V4 — 老将保养与主动招募扩展 */
(function(global) {
  'use strict';

  var recruitmentCandidates = [];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function playerOvr(player) {
    if (player && player._isUser) return Number(STATE.finalOVR) || Number(player.ovr) || 50;
    return Number(player && player.ovr) || 50;
  }

  function teamSnapshot(team) {
    var roster = (NBA2K_DATA[team] || []).slice().sort(function(a, b) { return playerOvr(b) - playerOvr(a); });
    var lineup = typeof calcTeamLineup === 'function' ? calcTeamLineup(team) : { starters: {} };
    var starters = [];
    Object.keys(lineup.starters || {}).forEach(function(pos) {
      var p = lineup.starters[pos];
      if (p && starters.indexOf(p) < 0) starters.push(p);
    });
    var top = roster.slice(0, 8);
    var topFive = top.slice(0, 5);
    var rotationRating = top.length
      ? Math.round(top.reduce(function(sum, p, idx) { return sum + playerOvr(p) * (idx < 5 ? 1.35 : 0.75); }, 0) /
        top.reduce(function(sum, p, idx) { return sum + (idx < 5 ? 1.35 : 0.75); }, 0))
      : 0;
    var power = typeof calcTeamPowerWithPlayer === 'function' ? calcTeamPowerWithPlayer(team) : {};
    var powerRating = Math.round((Number(power.offense) || rotationRating) * 0.36 +
      (Number(power.defense) || rotationRating) * 0.36 + (Number(power.depth) || rotationRating) * 0.28);
    return {
      team: team,
      roster: roster,
      starters: starters,
      topFive: topFive,
      rotationRating: rotationRating,
      powerRating: powerRating,
      power: power || {}
    };
  }

  function rosterRows(snapshot) {
    return snapshot.roster.slice(0, 15).map(function(p, idx) {
      var isStarter = snapshot.starters.indexOf(p) >= 0;
      var age = p && p._isUser
        ? Number(STATE.career && STATE.career.currentAge) || 19
        : (typeof getLeaguePlayerAge === 'function' ? getLeaguePlayerAge(p) : Number(p && p._age) || '—');
      var contract = p && p._isUser ? Number(STATE.career && STATE.career.contract) : Number(p && p.contract);
      var name = p && p._isUser ? '我的球员' : (p.cname || p.name || '球员');
      return '<div style="display:grid;grid-template-columns:24px minmax(0,1fr) 34px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);">' +
        '<span style="font-size:9px;color:' + (isStarter ? 'var(--orange)' : 'var(--text-muted)') + ';font-weight:700;">' + (isStarter ? '首发' : (idx < 8 ? '轮换' : '替补')) + '</span>' +
        '<span style="min-width:0;"><strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;' + (p && p._isUser ? 'color:var(--orange);' : '') + '">' + esc(name) + '</strong>' +
          '<small style="display:block;color:var(--text-dim);font-size:9px;margin-top:1px;">' + esc(p.pos || '—') + ' · ' + age + '岁 · ' + (contract > 0 ? contract + '年合同' : '合同待定') + (p._ratingSource ? ' · ' + esc(p._ratingSource) : '') + '</small></span>' +
        '<strong style="text-align:right;font-family:var(--font-display);font-size:12px;">' + playerOvr(p) + '</strong></div>';
    }).join('');
  }

  function rosterPanel(snapshot) {
    var p = snapshot.power || {};
    return '<section style="min-width:0;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:9px 10px;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
        '<div><strong style="font-size:13px;">' + (typeof getTeamLogo === 'function' ? getTeamLogo(snapshot.team, 18) : '') + ' ' + esc(typeof getTeamName === 'function' ? getTeamName(snapshot.team) : snapshot.team) + '</strong>' +
          '<div style="font-size:9px;color:var(--text-dim);margin-top:2px;">攻 ' + Math.round(Number(p.offense) || 0) + ' · 防 ' + Math.round(Number(p.defense) || 0) + ' · 深度 ' + Math.round(Number(p.depth) || 0) + '</div></div>' +
        '<div style="text-align:right;"><strong style="display:block;color:var(--orange);font-size:18px;line-height:1;">' + snapshot.powerRating + '</strong><small style="font-size:8px;color:var(--text-muted);">球队评分</small></div>' +
      '</div>' + rosterRows(snapshot) +
      '<div style="font-size:9px;color:var(--text-muted);padding-top:6px;">轮换评分 ' + snapshot.rotationRating + ' · 展示最多 15 人大名单</div></section>';
  }

  global.showTeamRosterModal = function(team, compareTeam, title) {
    team = team || STATE.careerTeam;
    if (!team || !NBA2K_DATA[team]) return;
    var existing = document.getElementById('team-roster-modal');
    if (existing) existing.remove();
    var left = teamSnapshot(team);
    var right = compareTeam && NBA2K_DATA[compareTeam] ? teamSnapshot(compareTeam) : null;
    var overlay = document.createElement('div');
    overlay.className = 'team-picker-overlay';
    overlay.id = 'team-roster-modal';
    overlay.innerHTML = '<div class="team-picker-modal" style="width:min(94vw,' + (right ? '680px' : '360px') + ');max-width:' + (right ? '680px' : '360px') + ';">' +
      '<div class="team-picker-header"><span>👥 ' + esc(title || (right ? '季后赛阵容对比' : '球队阵容')) + '</span><button class="modal-close" id="team-roster-close">✕</button></div>' +
      '<div style="padding:8px 12px 4px;font-size:10px;color:var(--text-dim);line-height:1.5;">球队评分综合首发、轮换、攻防与阵容深度；名单按总评排序。</div>' +
      '<div style="display:grid;grid-template-columns:repeat(' + (right ? '2' : '1') + ',minmax(0,1fr));gap:8px;padding:6px 10px 12px;max-height:76vh;overflow:auto;">' +
        rosterPanel(left) + (right ? rosterPanel(right) : '') + '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('team-roster-close').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  };

  global.showCurrentTeamRoster = function() {
    global.showTeamRosterModal(STATE.careerTeam, null, '当前球队完整阵容');
  };

  global.showPlayoffMatchupPreview = function(teamA, teamB) {
    global.showTeamRosterModal(teamA, teamB, '季后赛阵容与评分');
  };

  function recruitmentRosterSummary() {
    var snap = teamSnapshot(STATE.careerTeam);
    var changes = STATE._leagueChanges || {};
    var left = [];
    (changes.retired || []).forEach(function(x) { if (x.team === STATE.careerTeam) left.push((x.name || '球员') + '（退役）'); });
    (changes.freeAgents || []).forEach(function(x) { if (x.team === STATE.careerTeam) left.push((x.name || '球员') + '（离队）'); });
    var core = snap.topFive.map(function(p) { return esc(p && p._isUser ? '我的球员' : (p.cname || p.name || '球员')) + ' ' + playerOvr(p); }).join(' · ');
    return '<div style="margin:2px 12px 8px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);font-size:10px;line-height:1.6;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><strong>下赛季已确定核心</strong><strong style="color:var(--orange);">球队评分 ' + snap.powerRating + '</strong></div>' +
      '<div style="color:var(--text-dim);margin-top:3px;">' + (core || '暂无轮换信息') + '</div>' +
      (left.length ? '<div style="color:var(--red);margin-top:3px;">已确认离队：' + esc(left.join('、')) + '</div>' : '<div style="color:var(--green);margin-top:3px;">目前没有核心球员确认离队。</div>') +
      '<div style="margin-top:5px;color:var(--text-muted);">你作出决定后只会补充自由球员，不会再随机交易或送走这里的现有队友。</div>' +
      '<button class="btn btn-secondary btn-sm" style="width:100%;margin-top:7px;" onclick="showCurrentTeamRoster()">👥 查看完整阵容与合同</button></div>';
  }

  global.getVeteranMaintenanceLevel = function(age) {
    if ((Number(age) || 0) < 31 || !STATE.career) return 0;
    var profile = typeof getCareerProfile === 'function' ? getCareerProfile() : (STATE.career.profile || {});
    var coachReady = (Number(profile.coachTrust) || 0) >= 10;
    var leaderReady = (Number(profile.leadership) || 0) >= 10;
    if (coachReady && leaderReady) return 3;
    if (coachReady || leaderReady) return 2;
    return 1;
  };

  function recruitmentChance(player) {
    var profile = typeof getCareerProfile === 'function' ? getCareerProfile() : {};
    var ovr = Number(STATE.finalOVR) || 70;
    var targetOvr = Number(player && player.ovr) || 75;
    var championBonus = STATE.season && STATE.season.isChampion ? 10 : 0;
    var mvpBonus = (STATE.season && STATE.season.awards || []).some(function(a) {
      return a && a.isUser && (a.act === 'mvp' || a.act === 'fmvp');
    }) ? 6 : 0;
    var chance = 48
      + Math.max(-8, (ovr - 82) * 1.25)
      + Math.min(12, (Number(profile.leadership) || 0) * 0.6)
      + Math.min(8, (Number(profile.coachTrust) || 0) * 0.35)
      + Math.min(8, (Number(profile.fame) || 0) * 0.25)
      + championBonus + mvpBonus
      - Math.max(0, targetOvr - 84) * 2.2;
    return Math.max(35, Math.min(95, Math.round(chance)));
  }

  function availableCandidates() {
    var pool = (STATE._freeAgentPool || []).slice().sort(function(a, b) {
      return (Number(b.ovr) || 0) - (Number(a.ovr) || 0);
    });
    var strong = pool.filter(function(p) { return (Number(p.ovr) || 0) >= 78; });
    return (strong.length ? strong : pool).slice(0, 8);
  }

  function showRecruitmentMarket(done) {
    var c = STATE.career;
    if (!c || c.contract <= 0) { done(); return; }
    c.flags = c.flags || {};
    var seasonKey = c.seasonCount || 0;
    if (c.flags.userRecruitmentSeason === seasonKey) { done(); return; }
    recruitmentCandidates = availableCandidates();
    if (!recruitmentCandidates.length) { done(); return; }
    c.flags.userRecruitmentSeason = seasonKey;
    STATE._userRecruitmentDone = done;

    var existing = document.getElementById('user-recruitment-modal');
    if (existing) existing.remove();
    var teamName = typeof getTeamName === 'function' ? getTeamName(STATE.careerTeam) : STATE.careerTeam;
    var html = '<div class="team-picker-overlay" id="user-recruitment-modal">';
    html += '<div class="team-picker-modal">';
    html += '<div class="team-picker-header"><span>⭐ 主动招募</span></div>';
    html += '<div style="padding:10px 12px 6px;font-size:12px;color:var(--text-dim);line-height:1.6;">你可以代表 ' + teamName + ' 游说一名自由球员。每个休赛期只有一次机会，成功率取决于你的实力、领导力、球队关系与上赛季成绩。</div>';
    html += recruitmentRosterSummary();
    html += '<div style="padding:2px 12px 8px;max-height:58vh;overflow-y:auto;">';
    recruitmentCandidates.forEach(function(p, idx) {
      var name = p.cname || p.name || '自由球员';
      var fromName = p._origTeam ? (typeof getTeamName === 'function' ? getTeamName(p._origTeam) : p._origTeam) : '自由市场';
      var chance = recruitmentChance(p);
      var hs = typeof getPlayerHeadshotStyle === 'function' ? getPlayerHeadshotStyle(p.name || p.nameEn || name, 38) : '';
      var avatar = hs
        ? '<div style="' + hs + ';width:38px;height:38px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>'
        : '<div style="width:38px;height:38px;border-radius:50%;background:var(--orange-bg);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">🏀</div>';
      html += '<button class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:7px;padding:8px 9px;text-align:left;justify-content:flex-start;" onclick="chooseUserRecruitment(' + idx + ')">';
      html += avatar + '<span style="flex:1;min-width:0;margin-left:8px;"><strong style="display:block;color:var(--text);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</strong><span style="display:block;font-size:10px;color:var(--text-dim);margin-top:2px;">' + (p.pos || '—') + ' · OVR ' + (p.ovr || '—') + ' · 来自 ' + fromName + '</span></span>';
      html += '<span style="font-family:var(--font-display);color:var(--orange);font-size:12px;white-space:nowrap;">' + chance + '%</span></button>';
    });
    html += '</div><div style="padding:8px 12px 14px;border-top:1px solid var(--border-light);">';
    html += '<button class="btn btn-secondary btn-sm" style="width:100%;" onclick="skipUserRecruitment()">本年不招募</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function completeFlow() {
    var done = STATE._userRecruitmentDone;
    STATE._userRecruitmentDone = null;
    recruitmentCandidates = [];
    if (typeof done === 'function') done();
  }

  function signTarget(player) {
    var pool = STATE._freeAgentPool || [];
    var poolIdx = pool.indexOf(player);
    if (poolIdx >= 0) pool.splice(poolIdx, 1);
    var roster = NBA2K_DATA[STATE.careerTeam] || (NBA2K_DATA[STATE.careerTeam] = []);
    var released = null;
    if (roster.length >= 15) {
      var weakestIdx = -1;
      for (var i = 0; i < roster.length; i++) {
        var member = roster[i];
        if (!member || member._isUser) continue;
        if (weakestIdx < 0 || (Number(member.ovr) || 0) < (Number(roster[weakestIdx].ovr) || 0)) weakestIdx = i;
      }
      if (weakestIdx >= 0) {
        released = roster.splice(weakestIdx, 1)[0];
        released._origTeam = STATE.careerTeam;
        pool.push(released);
      }
    }
    var fromTeam = player._origTeam || '';
    player.contract = randomContractByAge(getLeaguePlayerAge(player));
    player._justSigned = true;
    player._recruitedByUser = true;
    roster.push(player);
    STATE._leagueChanges = STATE._leagueChanges || {};
    STATE._leagueChanges.freeSignings = STATE._leagueChanges.freeSignings || [];
    STATE._leagueChanges.freeSignings.push({
      name: player.cname || player.name,
      nameEN: player.name || '',
      from: fromTeam,
      to: STATE.careerTeam,
      ovr: player.ovr,
      userRecruited: true
    });
    STATE._leagueChanges.userRecruitments = STATE._leagueChanges.userRecruitments || [];
    STATE._leagueChanges.userRecruitments.push({ name: player.cname || player.name, ovr: player.ovr, from: fromTeam });
    if (typeof clearLineupCache === 'function') clearLineupCache();
    return released;
  }

  global.skipUserRecruitment = function() {
    var modal = document.getElementById('user-recruitment-modal');
    if (modal) modal.remove();
    completeFlow();
  };

  global.chooseUserRecruitment = function(idx) {
    var player = recruitmentCandidates[idx];
    if (!player) return;
    var modal = document.getElementById('user-recruitment-modal');
    if (modal) modal.remove();
    var chance = recruitmentChance(player);
    var success = rngNext() * 100 < chance;
    var name = player.cname || player.name || '目标球员';
    var result;
    if (success) {
      var released = signTarget(player);
      result = '你亲自打通电话，谈了球队角色，也谈了下一次冲击冠军的计划。<br><br><strong>' + name + '</strong> 接受邀请，加入 ' + (typeof getTeamName === 'function' ? getTeamName(STATE.careerTeam) : STATE.careerTeam) + '，合同 ' + player.contract + ' 年。';
      if (released) result += '<br><br>为腾出名单位置，球队裁掉了 ' + (released.cname || released.name) + '。';
    } else {
      result = '你完成了招募，但 <strong>' + name + '</strong> 最终选择继续考虑其他球队。目标仍留在自由市场，本赛季的主动招募机会已经使用。';
    }
    if (STATE.career) {
      STATE.career.offseasonHistory = STATE.career.offseasonHistory || [];
      STATE.career.offseasonHistory.push({
        seasonNum: STATE.career.seasonCount || 0,
        event: '主动招募',
        choice: name + '（成功率 ' + chance + '%）',
        result: success ? name + ' 接受邀请并加盟。' : name + ' 拒绝了本次邀请。'
      });
    }
    showOffseasonResultModal('主动招募', result, completeFlow);
  };

  global.continueCareerAfterTraining = function() {
    if (STATE.career && STATE.career.retired) return;
    evolveLeague();
    saveStandings();
    processDraft();
    // 先完成所有可能让队友离开的交易，再让玩家依据最终核心阵容决定是否招募。
    processTrades();
    showRecruitmentMarket(function() {
      assignFreeAgents();
      maybeMoveUserInOffseason(finishOffseasonPipeline);
    });
  };

  global.PP_MOD_V4 = {
    getUserRecruitmentChance: recruitmentChance,
    getUserRecruitmentCandidates: availableCandidates,
    showUserRecruitmentMarket: showRecruitmentMarket
  };
})(window);
