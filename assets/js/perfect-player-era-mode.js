/* Perfect Player V7 — 独立传奇年代模式（2003 / 2010 / 2016） */
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
  function completeRosters() { return global.__PP_COMPLETE_ERA_ROSTERS__ || {}; }
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
    var ovr = clamp(options.ovr != null ? options.ovr : row.ovr, 50, 99);
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
      contract: 1 + ((nameEn.length + ovr) % 4),
      _ratingSource: row.ratingSource || '时代数值校准',
      _ratingOfficial: !!row.ratingOfficial,
      _seasonLine: row.seasonLine || null
    };
    ATTRS.forEach(function(key) { p[key] = clamp(attrs[key], 25, 99); });
    if (row.threePT != null) p.threePT = clamp(row.threePT, 25, 99);
    if (row.DNK != null) p.DNK = clamp(row.DNK, 25, 99);
    return p;
  }
  function nameKey(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function buildLocalizedNameMap() {
    var map = {};
    function harvest(player) {
      if (!player) return;
      var english = player.nameEn || player.nameEN || player.name;
      var localized = player.nameCn || player.cname;
      if (english && localized && localized !== english) map[nameKey(english)] = localized;
    }
    Object.keys(global.NBA2K_DATA || {}).forEach(function(team) { (NBA2K_DATA[team] || []).forEach(harvest); });
    Object.keys(data().roster2003 || {}).forEach(function(team) { (data().roster2003[team] || []).forEach(harvest); });
    Object.keys(data().draftClasses || {}).forEach(function(year) { (data().draftClasses[year] || []).forEach(harvest); });
    return map;
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
    var base = completeRosters()[String(start)] || completeRosters()[start] || {};
    var localizedNames = buildLocalizedNameMap();
    NBA2K_TEAMS.forEach(function(team) {
      var rows = base[team] || [];
      var roster = rows.map(function(row) {
        var enriched = Object.assign({}, row);
        enriched.nameCn = enriched.nameCn || localizedNames[nameKey(enriched.nameEn)] || enriched.nameEn;
        return makePlayer(enriched, { age:Number(row.age) || 27, ovr:Number(row.ovr) || 65, draftYear:start });
      });
      NBA2K_DATA[team] = roster;
    });
    STATE._legendLeagueApplied = start;
    STATE.draftMode = 'historical';
    if (STATE.career) {
      STATE.career.flags = STATE.career.flags || {};
      STATE.career.flags.legendEraStart = start;
      STATE.career.flags.legendEraLabel = ({ 2003:'2003 白金一代', 2010:'2010 吾皇登基纪元', 2016:'2016 三分之王纪元' })[start] || (start + ' 传奇年代');
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
      '<div style="padding:10px 12px 4px;font-size:11px;line-height:1.6;color:var(--text-dim);">现役生涯会完整保留。传奇年代使用完整真实名单开局；有原始 2K 数值的球员采用对应版本评分，其余标注为当季数据校准。</div>' +
      '<div style="padding:7px 12px 14px;display:grid;gap:8px;">' +
        '<button class="btn btn-secondary" data-era="2003" style="text-align:left;padding:12px;"><strong style="display:block;color:var(--orange);">2003 白金一代</strong><small>科比、邓肯、艾弗森等时代核心同场；詹姆斯、韦德、安东尼、波什从这一届开始。</small></button>' +
        '<button class="btn btn-secondary" data-era="2010" style="text-align:left;padding:12px;"><strong style="display:block;color:var(--orange);">2010 吾皇登基纪元</strong><small>NBA 2K10 名单：詹姆斯冲击王座，科比卫冕，杜兰特崛起，库里开启新秀赛季。</small></button>' +
        '<button class="btn btn-secondary" data-era="2016" style="text-align:left;padding:12px;"><strong style="display:block;color:var(--orange);">2016 三分之王纪元</strong><small>NBA 2K16 名单：库里与 73 胜勇士领衔，骑士、雷霆、马刺共同争冠。</small></button>' +
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
