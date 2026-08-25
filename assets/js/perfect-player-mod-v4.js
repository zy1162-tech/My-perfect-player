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
    (changes.freeAgents || []).forEach(function(x) { if (x.team === STATE.careerTeam) left.push((x.name || '球员') + (x.roleLeave ? '（不满替补角色，离队）' : '（离队）')); });
    var core = snap.topFive.map(function(p) { return esc(p && p._isUser ? '我的球员' : (p.cname || p.name || '球员')) + ' ' + playerOvr(p); }).join(' · ');
    return '<div style="margin:2px 12px 8px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);font-size:10px;line-height:1.6;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><strong>下赛季已确定核心</strong><strong style="color:var(--orange);">球队评分 ' + snap.powerRating + '</strong></div>' +
      '<div style="color:var(--text-dim);margin-top:3px;">' + (core || '暂无轮换信息') + '</div>' +
      (left.length ? '<div style="color:var(--red);margin-top:3px;">已确认离队：' + esc(left.join('、')) + '</div>' : '<div style="color:var(--green);margin-top:3px;">目前没有核心球员确认离队。</div>') +
      '<div style="margin-top:5px;color:var(--text-muted);">你作出决定后只会补充自由球员，不会再随机交易或送走这里的现有队友。</div>' +
      '<button class="btn btn-secondary btn-sm" style="width:100%;margin-top:7px;" onclick="showCurrentTeamRoster()">👥 查看完整阵容与合同</button></div>';
  }

  // 轻量教练体系：只改变现有模拟的回合、攻防效率与三分倾向，不额外引入薪资或复杂战术操作。
  var TEAM_SYSTEMS = {
    balanced:{ name:'均衡体系', icon:'⚖️', desc:'按阵容能力自然分配球权，攻守没有额外偏置。', offense:0, defense:0, pace:0, three:0 },
    seven_seconds:{ name:'七秒进攻', icon:'⚡', desc:'更多转换和早攻：节奏更快、外线出手更多，防守稳定性略降。', offense:1.4, defense:-0.5, pace:4, three:0.010 },
    five_out:{ name:'五外空间', icon:'🎯', desc:'拉开空间，优先三分与突破分球；对内线保护要求更高。', offense:1.1, defense:-0.3, pace:1, three:0.016 },
    defense_transition:{ name:'防守反击', icon:'🛡️', desc:'优先防守、抢断与转换，比分更稳，节奏略快。', offense:0.4, defense:1.7, pace:2, three:0.004 },
    twin_towers:{ name:'双塔阵地', icon:'🏰', desc:'保护篮板和禁区，降低节奏，外线比重下降。', offense:0.5, defense:1.8, pace:-3, three:-0.008 }
  };

  function currentSystemKey() {
    var systems = STATE.teamSystems || {};
    var key = systems[STATE.careerTeam] || 'balanced';
    return TEAM_SYSTEMS[key] ? key : 'balanced';
  }

  global.getTeamSystemEffects = function(team) {
    if (team !== STATE.careerTeam) return TEAM_SYSTEMS.balanced;
    return TEAM_SYSTEMS[currentSystemKey()];
  };

  function departureRisk(player, snapshot) {
    if (!player || player._isUser) return { label:'核心', color:'var(--green)' };
    var starter = snapshot.starters.indexOf(player) >= 0;
    var contract = Number(player.contract) || 0;
    var ovr = playerOvr(player);
    if (player.roleLeave || (!starter && ovr >= 82 && contract <= 1)) return { label:'高风险', color:'var(--red)' };
    if (contract <= 1 && (!starter || ovr >= 78)) return { label:'需关注', color:'var(--orange)' };
    return { label:starter ? '稳定首发' : '合同稳定', color:'var(--green)' };
  }

  global.showLeagueIntel = function(done) {
    var old = document.getElementById('league-intel-modal');
    if (old) old.remove();
    var snapshot = teamSnapshot(STATE.careerTeam);
    var freeAgents = availableCandidates();
    var system = TEAM_SYSTEMS[currentSystemKey()];
    var rows = snapshot.roster.slice(0, 15).map(function(player, idx) {
      var risk = departureRisk(player, snapshot);
      var starter = snapshot.starters.indexOf(player) >= 0;
      var name = player._isUser ? '我的球员' : (player.cname || player.name || '球员');
      var contract = player._isUser ? Number(STATE.career && STATE.career.contract) : Number(player.contract);
      return '<div style="display:grid;grid-template-columns:34px minmax(0,1fr) 40px 54px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);font-size:11px;">' +
        '<span style="font-size:9px;color:' + (starter ? 'var(--orange)' : 'var(--text-muted)') + ';font-weight:700;">' + (starter ? '首发' : (idx < 10 ? '轮换' : '替补')) + '</span>' +
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>' + esc(name) + '</strong><small style="display:block;color:var(--text-dim);">' + esc(player.pos || '—') + ' · ' + Math.max(0, contract) + '年合同</small></span>' +
        '<strong style="text-align:right;">' + playerOvr(player) + '</strong><span style="text-align:right;font-size:9px;color:' + risk.color + ';font-weight:700;">' + risk.label + '</span></div>';
    }).join('');
    var fa = freeAgents.length ? freeAgents.map(function(player) { return esc(player.cname || player.name) + ' ' + playerOvr(player); }).join(' · ') : '当前没有值得重点关注的自由球员';
    var html = '<div class="team-picker-overlay" id="league-intel-modal"><div class="team-picker-modal" style="max-width:430px;">' +
      '<div class="team-picker-header"><span>📋 联盟情报页</span></div>' +
      '<div style="padding:9px 12px 4px;font-size:11px;color:var(--text-dim);line-height:1.55;">休赛期决策前的球队快照：先看合同、轮换与离队风险，再决定是否招募。当前体系：<strong style="color:var(--orange);">' + system.icon + ' ' + system.name + '</strong></div>' +
      '<div style="margin:8px 12px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);"><strong>球队评分 ' + snapshot.powerRating + '</strong><span style="float:right;color:var(--text-dim);">攻 ' + Math.round(snapshot.power.offense || 0) + ' · 防 ' + Math.round(snapshot.power.defense || 0) + '</span><div style="margin-top:7px;max-height:42vh;overflow:auto;">' + rows + '</div></div>' +
      '<div style="margin:8px 12px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:10px;line-height:1.55;"><strong>自由市场重点</strong><div style="color:var(--text-dim);margin-top:3px;">' + fa + '</div></div>' +
      '<div style="padding:8px 12px 14px;"><button class="btn btn-primary btn-sm" style="width:100%;" onclick="closeLeagueIntel()">进入体系设置</button></div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    STATE._leagueIntelDone = done;
  };

  global.closeLeagueIntel = function() {
    var modal = document.getElementById('league-intel-modal');
    if (modal) modal.remove();
    var done = STATE._leagueIntelDone;
    STATE._leagueIntelDone = null;
    if (typeof done === 'function') done();
  };

  function showTeamSystemChooser(done) {
    var old = document.getElementById('team-system-modal');
    if (old) old.remove();
    var current = currentSystemKey();
    var cards = Object.keys(TEAM_SYSTEMS).map(function(key) {
      var item = TEAM_SYSTEMS[key];
      var selected = key === current;
      return '<button class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:7px;padding:9px;text-align:left;border-color:' + (selected ? 'var(--orange)' : 'var(--border)') + ';" onclick="chooseTeamSystem(\'' + key + '\')"><strong>' + item.icon + ' ' + item.name + (selected ? ' · 当前' : '') + '</strong><small style="display:block;color:var(--text-dim);margin-top:3px;line-height:1.45;">' + item.desc + '</small></button>';
    }).join('');
    document.body.insertAdjacentHTML('beforeend', '<div class="team-picker-overlay" id="team-system-modal"><div class="team-picker-modal" style="max-width:410px;"><div class="team-picker-header"><span>🧠 教练与体系</span></div><div style="padding:9px 12px 5px;font-size:11px;color:var(--text-dim);line-height:1.55;">每个休赛期可重新确定一次球队打法。体系只改变模拟倾向，不会强行改写球员位置或名单。</div><div style="padding:4px 12px 10px;max-height:59vh;overflow:auto;">' + cards + '</div></div></div>');
    STATE._teamSystemDone = done;
  }

  global.chooseTeamSystem = function(key) {
    if (!TEAM_SYSTEMS[key]) key = 'balanced';
    STATE.teamSystems = STATE.teamSystems || {};
    STATE.teamSystems[STATE.careerTeam] = key;
    if (typeof clearLineupCache === 'function') clearLineupCache();
    var modal = document.getElementById('team-system-modal');
    if (modal) modal.remove();
    var done = STATE._teamSystemDone;
    STATE._teamSystemDone = null;
    if (typeof done === 'function') done();
  };

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

  var rosterCutCandidates = [];
  function hasRosterAuthority() {
    var career = STATE.career || {};
    var profile = career.profile || {};
    return Number(career.seasonCount || 0) >= 2 &&
      (Number(STATE.finalOVR || 0) >= 90 || Number(profile.leadership || 0) >= 12);
  }

  function completeRosterAuthorityFlow() {
    var done = STATE._rosterAuthorityDone;
    STATE._rosterAuthorityDone = null;
    rosterCutCandidates = [];
    if (typeof done === 'function') done();
  }

  function showRosterAuthority(done) {
    var career = STATE.career;
    if (!career || !hasRosterAuthority()) { done(); return; }
    career.flags = career.flags || {};
    var seasonKey = Number(career.seasonCount) || 0;
    if (career.flags.rosterAuthoritySeason === seasonKey) { done(); return; }
    var roster = NBA2K_DATA[STATE.careerTeam] || [];
    rosterCutCandidates = roster.filter(function(player) { return player && !player._isUser; }).sort(function(a, b) {
      return (Number(b.ovr) || 0) - (Number(a.ovr) || 0);
    });
    if (!rosterCutCandidates.length) { done(); return; }
    career.flags.rosterAuthoritySeason = seasonKey;
    STATE._rosterAuthorityDone = done;

    var old = document.getElementById('roster-authority-modal');
    if (old) old.remove();
    var html = '<div class="team-picker-overlay" id="roster-authority-modal"><div class="team-picker-modal">';
    html += '<div class="team-picker-header"><span>👑 球队老大 · 名单话语权</span></div>';
    html += '<div style="padding:10px 12px 7px;font-size:12px;color:var(--text-dim);line-height:1.65;">你的总评达到 90，或领导力达到 12 后，管理层会在每个休赛期接受一次裁员建议。裁掉的球员会进入自由市场；也可以保留原阵容。</div>';
    html += '<div style="padding:2px 12px 8px;max-height:58vh;overflow-y:auto;">';
    rosterCutCandidates.forEach(function(player, idx) {
      var name = player.cname || player.name || '队友';
      html += '<button class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:7px;padding:9px;text-align:left;justify-content:space-between;" onclick="chooseRosterCut(' + idx + ')">';
      html += '<span><strong style="display:block;color:var(--text);font-size:13px;">' + name + '</strong><small style="color:var(--text-dim);">' + (player.pos || '—') + ' · 合同 ' + Math.max(0, Number(player.contract) || 0) + ' 年</small></span>';
      html += '<span style="font-family:var(--font-display);color:var(--orange);">OVR ' + (player.ovr || '—') + '</span></button>';
    });
    html += '</div><div style="padding:8px 12px 14px;border-top:1px solid var(--border-light);"><button class="btn btn-secondary btn-sm" style="width:100%;" onclick="skipRosterCut()">保留当前全部队友</button></div>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  global.skipRosterCut = function() {
    var modal = document.getElementById('roster-authority-modal');
    if (modal) modal.remove();
    completeRosterAuthorityFlow();
  };

  global.chooseRosterCut = function(idx) {
    var player = rosterCutCandidates[idx];
    var roster = NBA2K_DATA[STATE.careerTeam] || [];
    var rosterIdx = roster.indexOf(player);
    if (!player || rosterIdx < 0) return;
    roster.splice(rosterIdx, 1);
    player._origTeam = STATE.careerTeam;
    player._waivedByUser = true;
    STATE._freeAgentPool = STATE._freeAgentPool || [];
    STATE._freeAgentPool.push(player);
    STATE._leagueChanges = STATE._leagueChanges || {};
    STATE._leagueChanges.userWaives = STATE._leagueChanges.userWaives || [];
    STATE._leagueChanges.userWaives.push({ name:player.cname || player.name, ovr:player.ovr, from:STATE.careerTeam });
    STATE.career.offseasonHistory = STATE.career.offseasonHistory || [];
    STATE.career.offseasonHistory.push({
      seasonNum:STATE.career.seasonCount || 0, event:'球队老大名单建议', choice:'建议裁掉 ' + (player.cname || player.name),
      result:'管理层接受建议，球员进入自由市场。'
    });
    if (typeof clearLineupCache === 'function') clearLineupCache();
    var modal = document.getElementById('roster-authority-modal');
    if (modal) modal.remove();
    showOffseasonResultModal('名单话语权', '管理层接受了你的建议，<strong>' + (player.cname || player.name) + '</strong> 已离队并进入自由市场。球队会在后续招募与自由市场阶段补齐最多 15 人名单。', completeRosterAuthorityFlow);
  };

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
    global.showLeagueIntel(function() {
      showTeamSystemChooser(function() {
        showRosterAuthority(function() {
          showRecruitmentMarket(function() {
            assignFreeAgents();
            maybeMoveUserInOffseason(finishOffseasonPipeline);
          });
        });
      });
    });
  };

  global.PP_MOD_V4 = {
    getUserRecruitmentChance: recruitmentChance,
    getUserRecruitmentCandidates: availableCandidates,
    showUserRecruitmentMarket: showRecruitmentMarket,
    showLeagueIntel: global.showLeagueIntel,
    getTeamSystemEffects: global.getTeamSystemEffects,
    hasRosterAuthority: hasRosterAuthority,
    showRosterAuthority: showRosterAuthority
  };
})(window);
