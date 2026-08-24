/* Perfect Player V4 — 老将保养与主动招募扩展 */
(function(global) {
  'use strict';

  var recruitmentCandidates = [];

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
    if (roster.length >= 18) {
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
    showRecruitmentMarket(function() {
      assignFreeAgents();
      processTrades();
      maybeMoveUserInOffseason(finishOffseasonPipeline);
    });
  };

  global.PP_MOD_V4 = {
    getUserRecruitmentChance: recruitmentChance,
    getUserRecruitmentCandidates: availableCandidates,
    showUserRecruitmentMarket: showRecruitmentMarket
  };
})(window);

