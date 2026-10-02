/* 生涯事件：定义 → 选择 → 比赛消费 → 结算。核心引擎显式调用，不包装旧函数。 */
'use strict';

var CAREER_EXPERIENCE_EVENTS = [
  { id:'rotation_tryout', arc:'rotation', stage:0, title:'教练给了你三场试用',
    scene:'下一段轮换表空出了时间。教练问你：要不要用三场比赛，证明自己值得更多机会？',
    choices:[
      { label:'接下试用', effect:{ minutes:6, load:2, games:3 }, task:'minutes' },
      { label:'先守住现有轮换', effect:{ chemistry:2, games:3 } }
    ] },
  { id:'rotation_review', arc:'rotation', stage:1, title:'三场之后，教练打开录像',
    scene:'试用有了真实的比赛记录。教练愿意再给你一段时间，也提醒你：上场机会不能全靠硬扛。',
    choices:[
      { label:'继续争取分钟', effect:{ minutes:4, load:1, games:3 }, task:'minutes' },
      { label:'和搭档一起看录像', effect:{ chemistry:3, games:3 }, task:'team' }
    ] },
  { id:'rotation_identity', arc:'rotation', stage:2, title:'给自己的角色一个答案',
    scene:'队友开始知道该在什么回合找你。下一阶段，你想先成为稳住阵容的人，还是继续承担更多出场时间？',
    choices:[
      { label:'稳住球队配合', effect:{ teamChemistry:3 } },
      { label:'再承担一段重轮换', effect:{ minutes:5, load:2, games:3 }, task:'minutes' }
    ] },
  { id:'rival_first', arc:'rival', stage:0, title:'今晚，正面遇见{rival}',
    scene:'对方核心已经开始热身。这次交手会留在你的生涯记录里。你想多留在场上，还是先和队友打出配合？',
    choices:[
      { label:'多打一段，回应这次交手', effect:{ minutes:5, load:2, games:1 }, task:'duel' },
      { label:'按球队的配合应对', effect:{ chemistry:3, games:1 }, task:'duel' }
    ] },
  { id:'rival_return', arc:'rival', stage:1, title:'再次面对{rival}',
    scene:'这一次，你们都有上次的比赛可以回看。对手的名字已经和一段具体经历连在一起。',
    choices:[
      { label:'用配合找机会', effect:{ chemistry:4, games:1 }, task:'duel' },
      { label:'争取更多出场回应', effect:{ minutes:4, load:1, games:1 }, task:'duel' }
    ] },
  { id:'rival_respect', arc:'rival', stage:2, title:'交手之后，留下什么',
    scene:'又一次遇见{rival}。你可以把比赛里的答案留给球队，也可以继续把这段较量扛在自己身上。',
    choices:[
      { label:'把经验分享给队友', effect:{ teamChemistry:2 }, task:'duel' },
      { label:'继续扛这段较量', effect:{ minutes:3, load:1, games:1 }, task:'duel' }
    ] },
  { id:'recovery_plan', arc:'recovery', stage:0, title:'队医和你重排出场计划',
    scene:'伤病或额外负荷之后，下一段比赛需要一个明确的安排。队医建议先控制分钟，再观察实际出场记录。',
    choices:[
      { label:'接受三场限时安排', effect:{ limit:22, load:-3, games:3 }, task:'recovery' },
      { label:'维持轮换，缩减额外活动', effect:{ load:-1, games:3 } }
    ] },
  { id:'recovery_review', arc:'recovery', stage:1, title:'恢复安排有了记录',
    scene:'医疗组把上一段的出场时间摆到桌上。你可以继续控制负荷，也可以投入私人恢复支持。',
    choices:[
      { label:'支付私人恢复费用', effect:{ cash:-75000, load:-3, games:3 } },
      { label:'继续按球队方案限时出场', effect:{ limit:24, load:-2, games:3 }, task:'recovery' }
    ] },
  { id:'recovery_habit', arc:'recovery', stage:2, title:'把恢复变成习惯',
    scene:'下一段赛程又要开始。身体管理已经影响了你的轮换，你可以延续恢复安排，也可以帮全队一起准备。',
    choices:[
      { label:'继续保护身体', effect:{ limit:28, load:-2, games:3 }, task:'recovery' },
      { label:'和搭档一起准备比赛', effect:{ chemistry:3, games:3 }, task:'team' }
    ] },
  { id:'brand_day', arc:'business', stage:0, title:'品牌拍摄与下一段赛程',
    scene:'品牌方愿意支付一笔拍摄收入。工作要在比赛之间完成，额外行程会持续影响接下来三场的负荷。',
    choices:[
      { label:'接受这次拍摄', effect:{ cash:180000, load:2, games:3 } },
      { label:'留出时间恢复', effect:{ load:-2, games:3 } }
    ] },
  { id:'team_evening', arc:'business', stage:1, title:'用这笔收入做什么',
    scene:'队友提出一起吃饭、过一遍配合。你可以承担团队活动的费用，也可以先留住现金。',
    choices:[
      { label:'支付团队活动费用', effect:{ cash:-35000, teamChemistry:3 } },
      { label:'保留现金，自己准备', effect:{ load:-1, games:2 } }
    ] }
];

var careerPreparedGame = null;
var careerCoachResume = null;

function resetCareerExperienceTransient() {
  careerPreparedGame = null;
  careerCoachResume = null;
  ['career-decision-modal','career-pregame-modal','career-coach-modal','career-feedback-modal'].forEach(removeCareerExperienceModal);
}

function careerExperienceEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function careerExperienceMoney(value) {
  return new Intl.NumberFormat('zh-CN', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value || 0);
}

// 金额是游戏合约规则；旧档只记录启用账本之后的收入，不补造历史工资。
function estimateCareerAnnualSalary() {
  var c = STATE.career || {};
  if ((c.seasonCount || 0) === 0) {
    var type = c.draft && c.draft.type;
    return type === 'lottery' ? 6000000 : type === 'first' ? 3000000 : 1500000;
  }
  var ovr = Number(STATE.finalOVR) || 60;
  return ovr >= 95 ? 42000000 : ovr >= 90 ? 30000000 : ovr >= 85 ? 18000000 :
    ovr >= 80 ? 9000000 : ovr >= 75 ? 4500000 : ovr >= 68 ? 2500000 : 1500000;
}

function getCareerExperience() {
  if (!STATE.career) return null;
  var c = STATE.career;
  if (!c.eventExperience) {
    c.eventExperience = {
      version:1, team:STATE.careerTeam, arcs:{ rotation:0, rival:0, recovery:0 },
      effects:[], task:null, feedback:null, recoveryDue:false,
      money:{ cash:0, earned:0, salary:0, offcourt:0, spent:0, annualSalary:estimateCareerAnnualSalary(),
        fromSeason:c.seasonCount || 0, fromGame:(STATE.season && STATE.season.games || []).length, entries:[] },
      season:{ number:-1 }, coaches:{}
    };
  }
  var e = c.eventExperience;
  if (e.season.number !== (c.seasonCount || 0)) {
    e.season = { number:c.seasonCount || 0, settled:{}, receipts:{}, salaryGames:0, business:0, coachUsed:{} };
    e.effects = [];
    e.task = null;
    e.pending = null;
    e.awaitingGameKey = null;
  }
  if (e.team !== STATE.careerTeam) {
    e.team = STATE.careerTeam;
    e.effects = [];
    e.task = null;
    e.pending = null;
    e.awaitingGameKey = null;
  }
  return e;
}

function getCareerExperienceModifiers() {
  var out = { minutes:0, limit:42, load:0, chemistry:0 };
  var e = getCareerExperience();
  if (!e || (typeof isLegendChallengeSeriesActive === 'function' && isLegendChallengeSeriesActive())) return out;
  e.effects.forEach(function(fx) {
    if (fx.gamesLeft <= 0) return;
    out.minutes += fx.minutes || 0;
    out.limit = Math.min(out.limit, fx.limit || 42);
    out.load += fx.load || 0;
    out.chemistry += fx.chemistry || 0;
  });
  return out;
}

function recordCareerTransaction(id, kind, title, amount) {
  var e = getCareerExperience();
  if (!e || !Number.isFinite(amount) || !Number.isInteger(amount)) return false;
  if (e.season.receipts[id] || e.money.cash + amount < 0) return false;
  e.season.receipts[id] = true;
  e.money.cash += amount;
  if (amount > 0) {
    e.money.earned += amount;
    e.money[kind === 'salary' ? 'salary' : 'offcourt'] += amount;
  } else e.money.spent -= amount;
  e.money.entries.push({ id:id, title:title, amount:amount, season:STATE.career.seasonCount || 0 });
  e.money.entries = e.money.entries.slice(-16);
  return true;
}

function renewCareerExperienceContract() {
  var e = getCareerExperience();
  if (e) e.money.annualSalary = estimateCareerAnnualSalary();
}

function getCareerExperienceRole() {
  var lineup = typeof calcTeamLineup === 'function' && STATE.careerTeam ? calcTeamLineup(STATE.careerTeam) : {};
  var players = (lineup.allPlayers || []).slice().sort(function(a, b) { return (Number(b.ovr) || 0) - (Number(a.ovr) || 0); });
  var rank = players.findIndex(function(p) { return p._isUser; });
  if (rank === 0 && (Number(STATE.finalOVR) || 0) >= 90) return '大当家';
  if (lineup.isUserStarter) return '首发';
  return rank >= 0 && rank < 10 ? '轮换' : '争取轮换';
}

function getCareerExperienceChemistry() {
  var mods = typeof getNextSeasonMods === 'function' ? getNextSeasonMods() : {};
  return Math.max(-10, Math.min(10, (Number(mods.teamChemistry) || 0) + getCareerExperienceModifiers().chemistry));
}

function getCareerCoachAuthority() {
  var e = getCareerExperience();
  if (!e || !STATE.careerTeam || STATE.career.retired) return { allowed:false, reason:'先进入球队生涯' };
  if (e.season.coachUsed[STATE.careerTeam]) return { allowed:false, reason:'本赛季已提出过换帅建议' };
  var leader = getCareerExperienceRole() === '大当家' ||
    (window.PP_MOD_V4 && PP_MOD_V4.hasRosterAuthority());
  var chemistry = getCareerExperienceChemistry() >= 6;
  return { allowed:!!(leader || chemistry), reason:leader ? '队内话语权已获得管理层认可' :
    chemistry ? '默契达到 6，队友支持你提出建议' : '需要大当家话语权，或场上默契达到 6/10' };
}

function getCareerCoachCandidates() {
  var systems = window.PP_MOD_V4 ? PP_MOD_V4.teamSystems : {};
  var focus = { balanced:['FIN','PAS','PDEF'], seven_seconds:['ATH','HAN','FIN'],
    five_out:['threePT','PAS','HAN'], defense_transition:['PDEF','BLK','ATH'], twin_towers:['IDEF','REB','FIN'] };
  return Object.keys(systems).map(function(key) {
    var keys = focus[key];
    var fit = Math.round(keys.reduce(function(sum, attr) { return sum + (Number(STATE.attrs[attr]) || 50); }, 0) / keys.length);
    return { id:key, name:systems[key].name + '教练', fit:fit, system:systems[key] };
  }).sort(function(a, b) { return b.fit - a.fit; });
}

function hireCareerCoach(key) {
  var e = getCareerExperience();
  var authority = getCareerCoachAuthority();
  var candidate = getCareerCoachCandidates().find(function(coach) { return coach.id === key; });
  if (!authority.allowed || !candidate || !PP_MOD_V4.setTeamSystem(key)) return false;
  e.coaches[STATE.careerTeam] = { id:key, name:candidate.name, season:STATE.career.seasonCount || 0 };
  e.season.coachUsed[STATE.careerTeam] = true;
  e.lastNote = '管理层采纳建议：' + candidate.name + '到任，下一场按' + candidate.system.name + '比赛。';
  refreshCareerExperience();
  if (typeof autoSaveGame === 'function') autoSaveGame();
  closeCareerCoachSearch();
  return true;
}

function openCareerCoachSearch() {
  if (!window.PP_MOD_V4 || !getCareerExperience()) return;
  var authority = getCareerCoachAuthority();
  var current = (STATE.teamSystems || {})[STATE.careerTeam] || 'balanced';
  var cards = getCareerCoachCandidates().map(function(coach) {
    return '<button class="ce-choice" onclick="hireCareerCoach(\'' + coach.id + '\')"' +
      (authority.allowed ? '' : ' disabled') + '><strong>' + coach.system.icon + ' ' + coach.name +
      (coach.id === current ? ' · 当前体系' : '') + '</strong><span>与你的球风契合度 ' + coach.fit + '/100</span><small>' +
      careerExperienceEscape(coach.system.desc) + '</small></button>';
  }).join('');
  showCareerExperienceModal('career-coach-modal', '制服组 · 主教练人选', '<p>' + careerExperienceEscape(authority.reason) +
    '。每赛季可建议一次，费用由球队承担。</p><div class="ce-choices">' + cards +
    '</div><button class="btn btn-secondary" onclick="closeCareerCoachSearch()">返回</button>');
}

function closeCareerCoachSearch() {
  removeCareerExperienceModal('career-coach-modal');
  if (careerCoachResume) {
    var resume = careerCoachResume;
    careerCoachResume = null;
    resume();
  } else if (careerPreparedGame) showCareerPreparedMatchup();
}

function pauseCareerSimulationForCoach(resume) {
  if (!document.getElementById('career-coach-modal')) return false;
  careerCoachResume = resume;
  return true;
}

function refreshCareerExperience() {
  if (typeof refreshPlayerStateStripLive === 'function') refreshPlayerStateStripLive();
}

function getCareerExperienceRival(opponent) {
  var c = STATE.career;
  c.flags = c.flags || {};
  var rival = c.flags.storyRival;
  if (rival && rival.name) {
    Object.keys(NBA2K_DATA).some(function(team) {
      if (!(NBA2K_DATA[team] || []).some(function(p) { return p.name === rival.name && !p._isUser; })) return false;
      rival.team = team;
      return true;
    });
    return rival;
  }
  var player = (NBA2K_DATA[opponent] || []).filter(function(p) { return !p._isUser; })
    .sort(function(a, b) { return (Number(b.ovr) || 0) - (Number(a.ovr) || 0); })[0];
  if (!player) return null;
  c.flags.storyRival = { name:player.name, cname:player.cname || player.name, team:opponent, ovr:Number(player.ovr) || 0, pos:player.pos };
  return c.flags.storyRival;
}

function getCareerExperienceMatchKey(opponent, options) {
  options = options || {};
  var index = options.game && STATE.season.schedule ? STATE.season.schedule.indexOf(options.game) : -1;
  var label = options.isPlayoff ? (options.title || ('季后赛 G' + ((STATE.season.playoffStats || {}).games + 1))) :
    'G' + ((index >= 0 ? index : (STATE.season.games || []).length) + 1);
  return (STATE.career.seasonCount || 0) + ':' + STATE.careerTeam + ':' + (options.isPlayoff ? 'P:' : 'R:') + opponent + ':' + label;
}

function findCareerExperienceDecision(opponent, options) {
  options = options || {};
  var e = getCareerExperience();
  if (!e || STATE.career.retired || options.isLegendChallenge || getBranchNode('retirement_countdown') !== 'start') return null;
  if (e.pending) return CAREER_EXPERIENCE_EVENTS.find(function(def) { return def.id === e.pending.id; }) || null;
  var c = STATE.career, played = (STATE.season.games || []).length;
  var counters = c.branchSeasonEvents;
  if (!counters || counters._season !== (c.seasonCount || 0)) counters = c.branchSeasonEvents = { _season:c.seasonCount || 0, _count:0 };
  if ((counters._count || 0) >= 5 || played < 3 ||
      (c._lastSeasonBranchGame != null && played - c._lastSeasonBranchGame < 7) || e.task) return null;
  var ev = STATE.season.events || {};
  if (ev.injuryReturnNextGame || ev.injuryGamesLeft > 0) e.recoveryDue = true;
  var rival = played >= 8 ? getCareerExperienceRival(opponent) : STATE.career.flags && STATE.career.flags.storyRival;
  var arc = ev.injuryReturnNextGame && (e.arcs.recovery || 0) < 3 ? 'recovery' :
    played >= 14 && e.season.business === 0 ? 'business' :
    e.recoveryDue && (e.arcs.recovery || 0) < 3 ? 'recovery' :
    (e.arcs.rotation || 0) === 0 ? 'rotation' :
    rival && rival.team === opponent && (e.arcs.rival || 0) < 3 ? 'rival' :
    (e.arcs.rotation || 0) < 3 ? 'rotation' : 'business';
  var stage = arc === 'business' ? e.season.business : (e.arcs[arc] || 0);
  if (arc === 'business' && stage >= 2) return null;
  return CAREER_EXPERIENCE_EVENTS.find(function(def) { return def.arc === arc && def.stage === stage; }) || null;
}

function careerExperienceEffectText(fx) {
  var items = [];
  if (fx.cash) items.push((fx.cash > 0 ? '收入 +' : '支出 ') + careerExperienceMoney(Math.abs(fx.cash)));
  if (fx.minutes) items.push('轮换计划 +' + fx.minutes + ' 分钟（最高 42）');
  if (fx.limit) items.push('出场上限 ' + fx.limit + ' 分钟');
  if (fx.load) items.push('额外负荷 ' + (fx.load > 0 ? '+' : '') + fx.load);
  if (fx.chemistry) items.push('配合加成 +' + fx.chemistry);
  if (fx.teamChemistry) items.push('本季默契 +' + fx.teamChemistry);
  return items.join('；') + (fx.games ? ' · 持续 ' + fx.games + ' 场球队比赛' : '');
}

function beginCareerExperienceDecision(def, opponent, options) {
  var e = getCareerExperience();
  e.pending = { id:def.id, key:getCareerExperienceMatchKey(opponent, options), opponent:opponent };
  if (typeof autoSaveGame === 'function') autoSaveGame();
  showCareerExperienceDecision();
}

function showCareerExperienceDecision() {
  var e = getCareerExperience();
  var def = e && e.pending && CAREER_EXPERIENCE_EVENTS.find(function(item) { return item.id === e.pending.id; });
  if (!def) return;
  var rival = STATE.career.flags && STATE.career.flags.storyRival;
  var name = rival && (rival.cname || rival.name) || '对方核心';
  var choices = def.choices.map(function(choice, index) {
    var affordable = e.money.cash + (choice.effect.cash || 0) >= 0;
    return '<button class="ce-choice" onclick="chooseCareerExperienceDecision(' + index + ')"' + (affordable ? '' : ' disabled') +
      '><strong>' + careerExperienceEscape(choice.label) + '</strong><span>' +
      careerExperienceEscape(careerExperienceEffectText(choice.effect)) + '</span>' +
      (affordable ? '' : '<small>可用余额不足</small>') + '</button>';
  }).join('');
  showCareerExperienceModal('career-decision-modal', def.title.replace('{rival}', name),
    '<p class="ce-scene">' + careerExperienceEscape(def.scene.replace('{rival}', name)) + '</p>' +
    '<div class="ce-choices">' + choices + '</div><div class="ce-note" id="career-decision-message">' +
    '可用余额 ' + careerExperienceMoney(e.money.cash) + '</div>');
}

function chooseCareerExperienceDecision(index) {
  var e = getCareerExperience();
  var pending = e && e.pending;
  var def = pending && CAREER_EXPERIENCE_EVENTS.find(function(item) { return item.id === pending.id; });
  if (!def || !Number.isInteger(index) || !def.choices[index]) return false;
  var choice = def.choices[index], fx = choice.effect;
  var rival = STATE.career.flags && STATE.career.flags.storyRival;
  var resolvedTitle = def.title.replace('{rival}', rival && (rival.cname || rival.name) || '对方核心');
  if (e.money.cash + (fx.cash || 0) < 0) return false;
  if (fx.cash && !recordCareerTransaction('choice:' + def.id, 'offcourt', resolvedTitle, fx.cash)) return false;
  if (fx.games) e.effects.push({ id:def.id, title:resolvedTitle, gamesLeft:fx.games,
    minutes:fx.minutes || 0, limit:fx.limit || 42, load:fx.load || 0, chemistry:fx.chemistry || 0 });
  if (fx.teamChemistry) addSeasonMod('teamChemistry', fx.teamChemistry, -10, 10);
  if (fx.load >= 2) e.recoveryDue = true;
  if (choice.task) {
    var count = fx.games || 1;
    var plan = typeof getPlayerRotationPlan === 'function' ? getPlayerRotationPlan(STATE.attrs, STATE.position, !!(careerPreparedGame && careerPreparedGame.options.isPlayoff)) : 28;
    e.task = { id:def.id, title:resolvedTitle, kind:choice.task, remaining:count, total:count, successful:0,
      target:choice.task === 'recovery' ? (fx.limit || 42) : Math.max(6, Math.floor(plan - 2)), played:0, minutes:0, points:0, wins:0 };
  }
  if (def.arc === 'business') e.season.business++;
  else e.arcs[def.arc] = def.stage + 1;
  if (def.arc === 'recovery' && def.stage === 2) e.recoveryDue = false;
  STATE.career._lastSeasonBranchGame = (STATE.season.games || []).length;
  var counters = STATE.career.branchSeasonEvents || { _season:STATE.career.seasonCount || 0, _count:0 };
  counters._count = (counters._count || 0) + 1;
  STATE.career.branchSeasonEvents = counters;
  e.lastNote = choice.label + '：' + careerExperienceEffectText(fx);
  STATE.career.branchHistory = STATE.career.branchHistory || [];
  STATE.career.branchHistory.push({ seasonNum:(STATE.career.seasonCount || 0) + 1, event:resolvedTitle, choice:choice.label,
    result:careerExperienceEffectText(fx), phase:'pregame' });
  e.pending = null;
  removeCareerExperienceModal('career-decision-modal');
  refreshCareerExperience();
  if (typeof autoSaveGame === 'function') autoSaveGame();
  if (careerPreparedGame) showCareerPreparedMatchup();
  return true;
}

// 只在正式比赛写入之后调用；工资、效果期限和任务记录共用一次结算。
function settleCareerExperienceGame(key, stats, result, options) {
  var e = getCareerExperience();
  options = options || {};
  if (!e || options.isLegendChallenge || e.season.settled[key]) return false;
  e.season.settled[key] = true;
  if (!options.isPlayoff) {
    var games = (STATE.season.schedule || []).length || 82;
    if (e.season.salaryGames < games) {
      var paid = e.season.salaryGames++;
      var amount = Math.round(e.money.annualSalary * (paid + 1) / games) - Math.round(e.money.annualSalary * paid / games);
      recordCareerTransaction('salary:' + key, 'salary', '球队合约工资', amount);
    }
  }
  var ev = STATE.season.events || {};
  if (ev.injuryGamesLeft > 0 || ev.injuryReturnNextGame) e.recoveryDue = true;
  if (e.task) {
    var task = e.task, minutes = stats && stats.mins || 0;
    if (stats) { task.played++; task.minutes += minutes; task.points += stats.pts || 0; }
    if (result && result.won) task.wins++;
    var passed = task.kind === 'minutes' ? minutes >= task.target : task.kind === 'recovery' ? minutes <= task.target : !!(result && result.won);
    if (passed) task.successful++;
    task.remaining--;
    if (task.remaining <= 0) {
      var criterion = task.kind === 'minutes' ? '达到 ' + task.target + ' 分钟' : task.kind === 'recovery' ? '守住 ' + task.target + ' 分钟上限' : '球队获胜';
      e.feedback = { title:task.title, text:'安排已完成：' + task.total + ' 场球队比赛，实际出战 ' + task.played + ' 场，合计 ' +
        Math.round(task.minutes) + ' 分钟、' + task.points + ' 分。' + criterion + ' ' + task.successful + '/' + task.total + ' 场。' };
      e.task = null;
    }
  }
  e.effects.forEach(function(fx) { fx.gamesLeft--; });
  e.effects = e.effects.filter(function(fx) { return fx.gamesLeft > 0; });
  refreshCareerExperience();
  return true;
}

function renderCareerExperienceStrip(pregame) {
  var e = getCareerExperience();
  if (!e || !STATE.careerTeam) return '';
  var fx = getCareerExperienceModifiers(), mods = getNextSeasonMods(), ev = STATE.season && STATE.season.events || {};
  var load = (Number(mods.staminaLoad) || 0) + fx.load;
  var body = ev.injuryGamesLeft > 0 ? '休战 ' + ev.injuryGamesLeft + ' 场' : fx.limit < 42 ? '限时 ' + fx.limit + ' 分钟' : load >= 2 ? '额外负荷' : load < 0 ? '恢复安排' : '状态正常';
  var role = getCareerExperienceRole(), chemistry = getCareerExperienceChemistry();
  var planned = STATE.season && typeof getPlayerRotationPlan === 'function' ? Math.round(getPlayerRotationPlan(STATE.attrs, STATE.position, !!STATE.season.isPlayoffs)) : null;
  var cards = '<div class="ce-status-grid"><div><small>身体状态</small><strong>' + body + '</strong><span>负荷 ' + load + '</span></div>' +
    '<div><small>球队地位</small><strong>' + role + '</strong><span>' + (planned == null ? '等待轮换安排' : '轮换计划 ' + planned + ' 分钟') + '</span></div>' +
    '<div><small>场上默契</small><strong>' + (chemistry >= 6 ? '配合成熟' : chemistry >= 2 ? '逐渐熟悉' : '磨合中') + '</strong><span>' + chemistry + '/10</span></div>' +
    '<div><small>场外收入 · 模拟</small><strong>' + careerExperienceMoney(e.money.cash) + '</strong><span>累计收入 ' + careerExperienceMoney(e.money.earned) + '</span></div></div>';
  var effects = e.effects.map(function(item) { return '<li>' + careerExperienceEscape(careerExperienceEffectText(item)) +
    ' · 剩余 ' + item.gamesLeft + ' 场</li>'; }).join('');
  var entries = e.money.entries.slice().reverse().map(function(item) { return '<li><span>' + careerExperienceEscape(item.title) + '</span><b>' +
    (item.amount >= 0 ? '+' : '−') + careerExperienceMoney(Math.abs(item.amount)) + '</b></li>'; }).join('');
  var coach = e.coaches[STATE.careerTeam];
  return '<section id="' + (pregame ? 'career-pregame-status' : 'player-state-strip') + '" class="ce-status-strip">' + cards +
    '<details class="player-state-details"><summary>本场安排、收支与制服组</summary><div class="ce-details">' +
    (e.lastNote ? '<p>上次选择：' + careerExperienceEscape(e.lastNote) + '</p>' : '') +
    (e.task ? '<p>当前安排：还剩 ' + e.task.remaining + '/' + e.task.total + ' 场，已完成 ' + e.task.successful + ' 场要求。</p>' : '') +
    (e.feedback ? '<p>' + careerExperienceEscape(e.feedback.text) + '</p>' : '') +
    '<ul>' + effects + '</ul><p>模拟年薪 ' + careerExperienceMoney(e.money.annualSalary) + '；已领工资 ' + careerExperienceMoney(e.money.salary) +
    '；场外收入 ' + careerExperienceMoney(e.money.offcourt) + '；累计支出 ' + careerExperienceMoney(e.money.spent) + '。</p>' +
    '<p class="ce-note">账本从第 ' + (e.money.fromSeason + 1) + ' 赛季、第 ' + (e.money.fromGame + 1) + ' 场起记录。合约工资按常规赛球队比赛结算，伤病缺席也照常发放。</p>' +
    '<ul class="ce-ledger">' + entries + '</ul><p>' + careerExperienceEscape(coach ? '主教练：' + coach.name : '当前主教练沿用球队体系') +
    '</p><button class="btn btn-secondary btn-sm" onclick="openCareerCoachSearch()">寻找契合球风的教练</button></div></details></section>';
}

function showCareerExperienceModal(id, title, body) {
  removeCareerExperienceModal(id);
  document.body.insertAdjacentHTML('beforeend', '<div class="team-picker-overlay ce-overlay" id="' + id +
    '"><section class="ce-modal" role="dialog" aria-modal="true" aria-label="' + careerExperienceEscape(title) +
    '"><header><small>PERFECT PLAYER · 生涯现场</small><h2>' + careerExperienceEscape(title) + '</h2></header><div class="ce-modal-body">' + body + '</div></section></div>');
  var button = document.getElementById(id).querySelector('button:not(:disabled)');
  if (button) button.focus();
}

function removeCareerExperienceModal(id) {
  var modal = document.getElementById(id);
  if (modal) modal.remove();
}

function renderCareerMatchupPlayer(player, user) {
  var name = user ? ((typeof HUPU_USER !== 'undefined' && HUPU_USER.nickname) || '我的球员') : player.cname || player.name;
  var visual = user ? '<svg class="ce-jersey" viewBox="0 0 160 160" aria-label="我的球衣"><path d="M45 18 25 35 10 75 35 85 38 143 122 143 125 85 150 75 135 35 115 18 102 39 58 39Z" fill="currentColor"/><path d="M58 39Q80 65 102 39" fill="none" stroke="#fff" stroke-width="5"/><text x="80" y="103" text-anchor="middle" fill="#fff" font-size="46" font-weight="900">1</text></svg>' :
    '<div class="ce-player-photo" style="' + (typeof getPlayerHeadshotStyle === 'function' ? getPlayerHeadshotStyle(player, 128) : 'background:#fff') + '"></div>';
  var stats = user && STATE.season.playerStats ? STATE.season.playerStats : null;
  var average = stats && stats.games ? (stats.pts / stats.games).toFixed(1) + ' 分 · ' + (stats.reb / stats.games).toFixed(1) + ' 板 · ' + (stats.ast / stats.games).toFixed(1) + ' 助' : '等待本季比赛记录';
  return '<article class="ce-matchup-player">' + visual + '<h3>' + careerExperienceEscape(name) + '</h3><p>' +
    careerExperienceEscape(user ? STATE.position : player.pos) + ' · OVR ' + (user ? STATE.finalOVR : Number(player.ovr) || 0) +
    '</p><small>' + careerExperienceEscape(user ? average : '对方焦点球员') + '</small></article>';
}

function showCareerPreparedMatchup() {
  if (!careerPreparedGame) return;
  var e = getCareerExperience(), ctx = careerPreparedGame;
  var player = (NBA2K_DATA[ctx.opponent] || []).filter(function(p) { return !p._isUser; })
    .sort(function(a, b) { return (Number(b.ovr) || 0) - (Number(a.ovr) || 0); })[0] || { name:'对方球员', pos:'—', ovr:0 };
  var rival = STATE.career.flags && STATE.career.flags.storyRival;
  var title = ctx.options.title || ((STATE.season.games || []).length === 0 ?
    (STATE.career.seasonCount ? '新赛季首战' : '生涯首战') : rival && rival.team === ctx.opponent ? '宿敌交手' : '今晚的出场安排');
  var info = '<div class="ce-matchup-teams">' + careerExperienceEscape(getTeamName(STATE.careerTeam)) + ' <b>VS</b> ' +
    careerExperienceEscape(getTeamName(ctx.opponent)) + '</div><div class="ce-matchup-players">' + renderCareerMatchupPlayer({}, true) +
    renderCareerMatchupPlayer(player, false) + '</div>' + renderCareerExperienceStrip(true) +
    (e.feedback ? '<div class="ce-feedback">' + careerExperienceEscape(e.feedback.text) + '</div>' : '') +
    '<div class="ce-game-actions"><button class="btn btn-primary" onclick="runCareerPreparedGame(false)">模拟本场</button>' +
    '<button class="btn btn-secondary" onclick="runCareerPreparedGame(true)"' + (window.PP_LIVE ? '' : ' disabled') + '>观看比赛</button></div>';
  showCareerExperienceModal('career-pregame-modal', title, info);
}

function prepareCareerExperienceGame(opponent, options, runSkip, runWatch) {
  options = options || {};
  if (!STATE.career || !STATE.season || options.forceSkip || options.isLegendChallenge ||
      (typeof isLegendChallengeSeriesActive === 'function' && isLegendChallengeSeriesActive())) return false;
  var e = getCareerExperience(), key = getCareerExperienceMatchKey(opponent, options);
  var decision = findCareerExperienceDecision(opponent, options);
  var rival = STATE.career.flags && STATE.career.flags.storyRival;
  var preview = decision || e.feedback || e.awaitingGameKey === key || options.isPlayoff || (STATE.season.games || []).length === 0 ||
    (rival && rival.team === opponent && e.lastPreviewKey !== key);
  if (!preview) return false;
  e.awaitingGameKey = key;
  careerPreparedGame = { opponent:opponent, options:options, key:key, runSkip:runSkip, runWatch:runWatch };
  if (decision) beginCareerExperienceDecision(decision, opponent, options);
  else showCareerPreparedMatchup();
  return true;
}

function runCareerPreparedGame(watch) {
  var ctx = careerPreparedGame;
  if (!ctx || getCareerExperience().pending) return;
  careerPreparedGame = null;
  var e = getCareerExperience();
  e.awaitingGameKey = null;
  e.lastPreviewKey = ctx.key;
  e.feedback = null;
  removeCareerExperienceModal('career-pregame-modal');
  if (typeof autoSaveGame === 'function') autoSaveGame();
  (watch ? ctx.runWatch : ctx.runSkip)();
}

function showCareerExperienceFeedback(done) {
  var e = getCareerExperience();
  if (!e || !e.feedback) return false;
  var feedback = e.feedback;
  e.feedback = null;
  showCareerExperienceModal('career-feedback-modal', '本段安排结束', '<p>' + careerExperienceEscape(feedback.text) +
    '</p><button class="btn btn-primary" id="career-feedback-next">继续</button>');
  document.getElementById('career-feedback-next').onclick = function() {
    removeCareerExperienceModal('career-feedback-modal');
    done();
  };
  return true;
}

window.PP_CAREER_EVENTS = {
  resetTransient:resetCareerExperienceTransient,
  definitions:CAREER_EXPERIENCE_EVENTS, getState:getCareerExperience, getModifiers:getCareerExperienceModifiers,
  renderStateStrip:renderCareerExperienceStrip, prepareGame:prepareCareerExperienceGame,
  matchKey:getCareerExperienceMatchKey, settleGame:settleCareerExperienceGame, renewContract:renewCareerExperienceContract,
  choose:chooseCareerExperienceDecision, findDecision:findCareerExperienceDecision,
  showFeedback:showCareerExperienceFeedback, pauseForCoach:pauseCareerSimulationForCoach,
  getCoachAuthority:getCareerCoachAuthority, getCoachCandidates:getCareerCoachCandidates, hireCoach:hireCareerCoach
};
