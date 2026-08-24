/* Perfect Player V6 — 独立传奇年代模式（2003 / 2009） */
(function(global) {
  'use strict';

  var POS = { 1:'PG', 2:'SG', 3:'SF', 4:'PF', 5:'C' };
  var ATTRS = ['threePT','MID','FIN','DNK','HAN','PAS','PDEF','IDEF','BLK','REB','ATH','STR','CLU'];
  var TEMPLATES = {
    PG:{threePT:76,MID:78,FIN:76,DNK:55,HAN:87,PAS:86,PDEF:73,IDEF:50,BLK:38,REB:49,ATH:80,STR:50,CLU:78},
    SG:{threePT:80,MID:80,FIN:80,DNK:69,HAN:81,PAS:70,PDEF:72,IDEF:54,BLK:43,REB:52,ATH:81,STR:56,CLU:78},
    SF:{threePT:73,MID:77,FIN:82,DNK:78,HAN:77,PAS:67,PDEF:75,IDEF:68,BLK:57,REB:66,ATH:82,STR:69,CLU:76},
    PF:{threePT:57,MID:72,FIN:83,DNK:78,HAN:68,PAS:60,PDEF:72,IDEF:78,BLK:72,REB:78,ATH:74,STR:80,CLU:73},
    C:{threePT:42,MID:67,FIN:85,DNK:79,HAN:61,PAS:56,PDEF:63,IDEF:82,BLK:82,REB:85,ATH:67,STR:85,CLU:71}
  };

  function data() { return global.__PP_ERA_MODE_DATA__ || { roster2003:{}, draftClasses:{} }; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(Number(v) || lo))); }
  function mainPos(value) {
    var p = POS[value] || String(value || 'SF').split('/')[0].trim();
    return TEMPLATES[p] ? p : 'SF';
  }
  function normalizeTeam(team) {
    return ({ SEA:'OKC', NJN:'BKN', NOH:'NOP', NOK:'NOP', CHH:'CHA', VAN:'MEM' })[team] || team;
  }
  function generatedAttrs(pos, ovr) {
    pos = mainPos(pos);
    var base = TEMPLATES[pos];
    var delta = (Number(ovr) || 70) - 76;
    var out = {};
    ATTRS.forEach(function(key, idx) {
      var positionBias = ((idx * 7 + String(pos).charCodeAt(0)) % 5) - 2;
      out[key] = clamp(base[key] + delta * 0.72 + positionBias, 30, 97);
    });
    return out;
  }
  function makePlayer(row, options) {
    options = options || {};
    var pos = mainPos(row.pos);
    var ovr = clamp(options.ovr != null ? options.ovr : row.ovr, 55, 99);
    var attrs = row.attrs ? Object.assign({}, row.attrs) : generatedAttrs(pos, ovr);
    var nameEn = row.nameEn || ('Era Player ' + Math.random());
    var p = {
      name: nameEn,
      nameEN: nameEn,
      cname: row.nameCn || nameEn,
      pos: pos,
      ovr: ovr,
      type: ovr >= 88 ? '历史球星' : (ovr >= 78 ? '时代主力' : '时代球员'),
      _age: clamp(options.age != null ? options.age : row.age, 18, 41),
      _eraRoster: true,
      _draftYear: options.draftYear || row.draftYear || null,
      _potential: Number(row.potential) || 6,
      contract: 1 + ((nameEn.length + ovr) % 4)
    };
    ATTRS.forEach(function(key) { p[key] = clamp(attrs[key], 25, 99); });
    return p;
  }
  function rolePlayer(team, idx, year) {
    var positions = ['PG','SG','SF','PF','C'];
    var pos = positions[idx % positions.length];
    var ovr = 72 - Math.floor(idx / 3) - ((idx + year) % 3);
    return makePlayer({
      nameEn:'EraRole_' + year + '_' + team + '_' + (idx + 1),
      nameCn:(typeof getTeamName === 'function' ? getTeamName(team) : team) + '·时代轮换' + (idx + 1),
      pos:pos, ovr:ovr, age:23 + ((idx * 3 + year) % 9)
    });
  }
  function replaceWeakest(team, player) {
    var roster = NBA2K_DATA[team] || (NBA2K_DATA[team] = []);
    var duplicate = roster.some(function(p) { return p && String(p.name).toLowerCase() === String(player.name).toLowerCase(); });
    if (duplicate) return false;
    if (roster.length >= 18) {
      var weakest = -1;
      roster.forEach(function(p, idx) {
        if (p && !p._isUser && (weakest < 0 || Number(p.ovr) < Number(roster[weakest].ovr))) weakest = idx;
      });
      if (weakest >= 0) roster.splice(weakest, 1);
    }
    roster.push(player);
    return true;
  }
  function addDraftClass(year, elapsed, recordChanges) {
    var rows = data().draftClasses[String(year)] || [];
    if (!rows.length) return 0;
    var added = 0;
    rows.forEach(function(row, idx) {
      var team = normalizeTeam(row.team) || NBA2K_TEAMS[idx % NBA2K_TEAMS.length];
      if (NBA2K_TEAMS.indexOf(team) < 0) team = NBA2K_TEAMS[idx % NBA2K_TEAMS.length];
      var years = Math.max(0, Number(elapsed) || 0);
      var growth = Math.min(Number(row.potential) || 6, years * 1.7);
      var ovr = clamp((Number(row.rating) || 68) + growth, 58, 96);
      var age = row.birth ? year + years - Number(row.birth) : (Number(row.age) || 20) + years;
      var player = makePlayer(row, { ovr:ovr, age:age, draftYear:year });
      if (replaceWeakest(team, player)) {
        added++;
        if (recordChanges) {
          STATE._leagueChanges = STATE._leagueChanges || {};
          STATE._leagueChanges.rookies = STATE._leagueChanges.rookies || [];
          STATE._leagueChanges.rookies.push({ name:player.cname, team:team, historical:true, draftYear:year });
        }
      }
    });
    return added;
  }

  global.applyLegendEraLeague = function() {
    if (STATE.mode !== 'legend' || !STATE.eraStart) return;
    var start = Number(STATE.eraStart);
    if (STATE._legendLeagueApplied === start) return;
    var base = data().roster2003 || {};
    NBA2K_TEAMS.forEach(function(team) {
      var rows = base[team] || [];
      var roster = rows.map(function(row) {
        var elapsed = Math.max(0, start - 2003);
        var age = (Number(row.age) || 28) + elapsed;
        var ageChange = elapsed ? (age <= 28 ? Math.min(5, elapsed) : (age >= 34 ? -Math.min(8, age - 33) : 0)) : 0;
        return makePlayer(row, { age:age, ovr:clamp((Number(row.ovr) || 70) + ageChange, 58, 99), draftYear:2003 });
      }).filter(function(p) { return p._age <= 39; });
    // 开局直接给足完整轮换，避免首个休赛期为了补人数而混入大批陌生虚构新秀。
    while (roster.length < 18) roster.push(rolePlayer(team, roster.length, start));
      NBA2K_DATA[team] = roster;
    });
    if (start >= 2009) {
      for (var year = 2004; year <= start; year++) addDraftClass(year, start - year, false);
    }
    STATE._legendLeagueApplied = start;
    STATE.draftMode = 'historical';
    if (STATE.career) {
      STATE.career.flags = STATE.career.flags || {};
      STATE.career.flags.legendEraStart = start;
      STATE.career.flags.legendEraLabel = start === 2003 ? '2003 白金一代' : '2009 新世代';
    }
    if (typeof clearLineupCache === 'function') clearLineupCache();
  };

  global.showLegendEraPicker = function() {
    var old = document.getElementById('legend-era-picker');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.className = 'team-picker-overlay';
    overlay.id = 'legend-era-picker';
    overlay.innerHTML = '<div class="team-picker-modal" style="max-width:390px;">' +
      '<div class="team-picker-header"><span>🏆 选择传奇年代</span><button class="modal-close" id="legend-era-close">✕</button></div>' +
      '<div style="padding:10px 12px 4px;font-size:11px;line-height:1.6;color:var(--text-dim);">现役生涯会完整保留。传奇年代使用历史球员开局，之后按年份加入真实选秀届；角色球员属性由本项目独立生成。</div>' +
      '<div style="padding:7px 12px 14px;display:grid;gap:8px;">' +
        '<button class="btn btn-secondary" data-era="2003" style="text-align:left;padding:12px;"><strong style="display:block;color:var(--orange);">2003 白金一代</strong><small>科比、邓肯、艾弗森等时代核心同场；詹姆斯、韦德、安东尼、波什从这一届开始。</small></button>' +
        '<button class="btn btn-secondary" data-era="2009" style="text-align:left;padding:12px;"><strong style="display:block;color:var(--orange);">2009 新世代</strong><small>从 2003 联盟演进六年，加入霍华德、保罗、杜兰特、罗斯，并迎来库里、哈登、格里芬。</small></button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('legend-era-close').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    overlay.querySelectorAll('[data-era]').forEach(function(btn) {
      btn.onclick = function() {
        STATE.mode = 'legend';
        STATE.eraStart = Number(btn.getAttribute('data-era'));
        STATE.draftMode = 'historical';
        overlay.remove();
        startGame();
      };
    });
  };

  var originalProcessDraft = global.processDraft;
  global.processDraft = function() {
    if (STATE.mode !== 'legend' || !STATE.eraStart) return originalProcessDraft.apply(this, arguments);
    var year = Number(STATE.eraStart) + Number(STATE.career && STATE.career.seasonCount || 0);
    if (!data().draftClasses[String(year)] || !data().draftClasses[String(year)].length) {
      return originalProcessDraft.apply(this, arguments);
    }
    addDraftClass(year, 0, true);
    if (typeof clearLineupCache === 'function') clearLineupCache();
  };

  global.PP_ERA_MODE = { apply:global.applyLegendEraLeague, addDraftClass:addDraftClass };
})(window);
