/* 生涯事件：定义 → 选择 → 比赛消费 → 结算。核心引擎显式调用，不包装旧函数。 */
'use strict';

// 公开工资帽、底薪与首轮顺位表；来源与估算边界见 tools/artifacts/career-salary-calibration.md。
var CAREER_SALARY_CAPS = {"2003":43840000,"2004":43870000,"2005":49500000,"2006":53135000,"2007":55630000,"2008":58680000,"2009":57700000,"2010":58044000,"2011":58044000,"2012":58044000,"2013":58679000,"2014":63065000,"2015":70000000,"2016":94143000,"2017":99093000,"2018":101869000,"2019":109140000,"2020":109140000,"2021":112414000,"2022":123655000,"2023":136021000,"2024":140588000,"2025":154647000,"2026":164961000}; // 2003-04 至 2026-27
var CAREER_MINIMUM_SALARIES = {
  2003:[366931,563679,638679,663679,688679,751179,813679,876179,938679,1000000,1070000],
  2004:[385277,620046,695046,720046,745046,807546,870046,932546,995046,1000000,1100000],
  2005:[398762,641748,719373,745248,771123,835810,900498,965185,1029873,1035000,1138500],
  2006:[412718,664209,744551,771331,798112,865063,932015,998967,1065918,1071225,1178348],
  2007:[427163,687456,770610,798328,826046,895341,964636,1033930,1103225,1108718,1219590],
  2008:[442114,711517,797581,826269,854957,926678,998398,1070118,1141838,1147523,1262275],
  2009:[457588,736420,825497,855189,884881,959111,1033342,1107572,1181803,1187686,1306455],
  2010:[473604,762195,854389,885120,915852,992680,1069509,1146337,1223166,1229255,1352181],
  2011:[473604,762195,854389,885120,915852,992680,1069509,1146337,1223166,1229255,1352181],
  2012:[473604,762195,854389,885120,915852,992680,1069509,1146337,1223166,1229255,1352181],
  2013:[490180,788872,884293,916099,947907,1027424,1106942,1186459,1265977,1272279,1399507],
  2014:[507336,816482,915243,948163,981084,1063384,1145685,1227985,1310286,1316809,1448490],
  2015:[525093,845059,947276,981348,1015421,1100602,1185784,1270964,1356146,1362897,1499187],
  2016:[543471,874636,980431,1015696,1050961,1139123,1227286,1315448,1403611,1410598,1551659],
  2024:[1157153,1862265,2087519,2162606,2237691,2425403,2613120,2800834,2988550,3003427,3303771],
};
// 每行：第 1/2/3 年基准工资、第四年涨幅（百分比）；首轮按常见的 120% 签约。
var CAREER_ROOKIE_SCALES = {
  2003:[
    [3349100,3600300,3851500,26.1],
    [2996500,3221200,3446000,26.2],
    [2691000,2892800,3094700,26.4],
    [2426100,2608100,2790000,26.5],
    [2197000,2361800,2526600,26.7],
    [1995500,2145200,2294800,26.8],
    [1821600,1958200,2094900,27],
    [1668900,1794000,1919200,27.2],
    [1534000,1649100,1764100,27.4],
    [1457300,1566600,1675900,27.5],
    [1384400,1488300,1592100,32.7],
    [1315200,1413900,1512500,37.8],
    [1249500,1343200,1436900,42.9],
    [1187000,1276000,1365000,48.1],
    [1127600,1212200,1296800,53.3],
    [1071200,1151600,1231900,53.4],
    [1017700,1094000,1170300,53.6],
    [966800,1039300,1111800,53.8],
    [923300,992500,1061800,54],
    [886400,952800,1019300,54.2],
    [850900,914700,978500,59.3],
    [816900,878100,939400,64.5],
    [784200,843000,901800,69.7],
    [752800,809300,865800,74.9],
    [722700,776900,831100,80.1],
    [698800,751200,803600,80.3],
    [678600,729500,780400,80.4],
    [674400,725000,775500,80.5],
    [669500,719700,769900,80.5]
  ],
  2010:[
    [4286900,4608400,4929900,26.1],
    [3835600,4123200,4410900,26.2],
    [3444400,3702800,3961100,26.4],
    [3105500,3338400,3571300,26.5],
    [2812200,3023100,3234000,26.7],
    [2554200,2745800,2937400,26.8],
    [2331700,2506600,2681400,27],
    [2136100,2296300,2456500,27.2],
    [1963600,2110800,2258100,27.4],
    [1865300,2005200,2145100,27.5],
    [1772100,1905000,2037900,32.7],
    [1683500,1809700,1936000,37.8],
    [1599300,1719200,1839200,42.9],
    [1519400,1633300,1747300,48.1],
    [1443300,1551600,1659800,53.3],
    [1371200,1474000,1576900,53.4],
    [1302600,1400300,1498000,53.6],
    [1237500,1330300,1423100,53.8],
    [1181800,1270400,1359000,54],
    [1134500,1219600,1304700,54.2],
    [1089100,1170800,1252500,59.3],
    [1045600,1124000,1202400,64.5],
    [1003800,1079100,1154400,69.7],
    [963600,1035900,1108100,74.9],
    [925100,994400,1063800,80.1],
    [894400,961500,1028600,80.3],
    [868600,933700,998900,80.4],
    [863300,928000,992700,80.5],
    [857000,921300,985500,80.5],
    [850800,914600,978400,80.5]
  ],
  2016:[
    [4919300,5140700,5362100,26.1],
    [4401400,4599500,4797600,26.2],
    [3952500,4130400,4308300,26.4],
    [3563600,3724000,3884400,26.5],
    [3227100,3372300,3517500,26.7],
    [2931000,3062900,3194800,26.8],
    [2675700,2796100,2916500,27],
    [2451200,2561500,2671800,27.2],
    [2253300,2354700,2456100,27.4],
    [2140500,2236800,2333100,27.5],
    [2033500,2125000,2216500,32.7],
    [1931900,2018800,2105700,37.8],
    [1835200,1917800,2000400,42.9],
    [1743500,1822000,1900500,48.1],
    [1656200,1730700,1805300,53.3],
    [1573500,1644300,1715100,53.4],
    [1494800,1562000,1629300,53.6],
    [1420100,1484000,1547900,53.8],
    [1356100,1417200,1478200,54],
    [1301900,1360400,1419000,54.2],
    [1249800,1306000,1362200,59.3],
    [1199900,1253800,1307800,64.5],
    [1151900,1203700,1255600,69.7],
    [1105800,1155500,1205300,74.9],
    [1061600,1109300,1157100,80.1],
    [1026300,1072500,1118700,80.3],
    [996700,1041600,1086400,80.4],
    [990700,1035200,1079800,80.5],
    [983400,1027700,1071900,80.5],
    [976300,1020200,1064200,80.5]
  ],
  2026:[
    [12290000,12904800,13519200,26.1],
    [10996100,11546100,12096100,26.2],
    [9874800,10368200,10862400,26.4],
    [8903100,9348300,9793600,26.5],
    [8062300,8465200,8868300,26.7],
    [7322500,7688700,8055000,26.8],
    [6684700,7019100,7353000,27],
    [6123900,6430100,6736400,27.2],
    [5629000,5910900,6192200,27.4],
    [5347800,5615000,5882100,27.5],
    [5080200,5334400,5588500,32.7],
    [4826400,5067900,5309300,37.8],
    [4585000,4814400,5043500,42.9],
    [4356000,4573800,4791800,48.1],
    [4137900,4344800,4551600,53.3],
    [3931100,4127700,4324500,53.4],
    [3734400,3921200,4107800,53.6],
    [3547900,3725000,3902600,53.8],
    [3388100,3557400,3727200,54],
    [3252300,3414900,3577400,54.2],
    [3122300,3278600,3434800,59.3],
    [2997600,3147300,3297300,64.5],
    [2877800,3021800,3165300,69.7],
    [2762800,2900900,3039000,74.9],
    [2651900,2784400,2917400,80.1],
    [2564100,2692100,2820400,80.3],
    [2490100,2614700,2739500,80.4],
    [2474600,2598800,2722400,80.5],
    [2456900,2579700,2702600,80.5],
    [2439000,2560900,2683200,80.5]
  ],
};

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

var CAREER_MATCH_PLANS = {
  balanced:{ name:'均衡执行', desc:'按教练安排分配球权', stat:null, effects:{} },
  rim:{ name:'冲击篮筐', desc:'突破和内线终结，主动制造罚球', stat:'fta', unit:'次罚球', effects:{ three:0.85, mid:0.85, rim:1.65, foul:1.25 } },
  space:{ name:'外线拉开', desc:'增加三分出手，为球队拉开空间', stat:'threeA', unit:'次三分出手', effects:{ three:1.65, mid:0.85, rim:0.85 } },
  create:{ name:'串联队友', desc:'少一些单打，把球送到队友手里', stat:'ast', unit:'次助攻', effects:{ usage:0.88, assist:1.35 } }
};

function getCareerMatchPlanFit(plan) {
  if (!plan || plan.id === 'balanced') return 0;
  var attrs = STATE.attrs || {}, lineup = typeof calcTeamLineup === 'function' ? calcTeamLineup(plan.opponent) : null;
  var defenders = lineup ? Object.values(lineup.starters).filter(Boolean) : [];
  var key = plan.id === 'rim' ? 'IDEF' : 'PDEF';
  var defense = defenders.length ? defenders.reduce(function(sum,p) { return sum + (Number(p[key]) || 50); },0) / defenders.length : 75;
  var ability = plan.id === 'rim' ? (Number(attrs.FIN)||50)*0.72+(Number(attrs.DNK)||50)*0.28 :
    plan.id === 'space' ? (Number(attrs.threePT)||50) : (Number(attrs.PAS)||50)*0.75+(Number(attrs.HAN)||50)*0.25;
  return Math.max(-1.5,Math.min(1.5,(ability-defense)*0.10));
}

function getCareerMatchPlanModifiers(opponent) {
  var neutral = { id:null, three:1, mid:1, rim:1, foul:1, assist:1, usage:1, offense:0 };
  var e = getCareerExperience(), plan = e && e.matchPlan;
  if (!plan || plan.status !== 'playing' || plan.opponent !== opponent || !CAREER_MATCH_PLANS[plan.id]) return neutral;
  return Object.assign(neutral,CAREER_MATCH_PLANS[plan.id].effects,{ id:plan.id, offense:getCareerMatchPlanFit(plan) });
}

function selectCareerMatchPlan(id) {
  var ctx = careerPreparedGame, definition = CAREER_MATCH_PLANS[id];
  if (!ctx || !ctx.options.isPlayoff || !definition) return;
  var minutes = typeof getPlayerRotationPlan === 'function' ? getPlayerRotationPlan(STATE.attrs,STATE.position,true) : 30;
  var goal = definition.stat ? Math.max(2,Math.round(minutes / (id === 'rim' ? 8 : id === 'space' ? 5 : 7))) : 0;
  getCareerExperience().matchPlan = { id:id, key:ctx.key, opponent:ctx.opponent, goal:goal, status:'ready' };
  showCareerPreparedMatchup();
  if (typeof autoSaveGame === 'function') autoSaveGame();
}

function renderCareerMatchPlanPicker() {
  var e = getCareerExperience(), selected = e.matchPlan;
  return '<section class="ce-match-plan-picker" aria-label="本场打法"><h3>本场怎么打</h3><div class="ce-plan-options">' +
    Object.keys(CAREER_MATCH_PLANS).map(function(id) {
      var plan = CAREER_MATCH_PLANS[id], active = selected && selected.id === id;
      return '<button type="button" class="ce-plan-option' + (active ? ' selected' : '') + '" aria-pressed="' + !!active + '" onclick="selectCareerMatchPlan(\'' + id + '\')"><strong>' + plan.name + '</strong><span>' + plan.desc + '</span></button>';
    }).join('') + '</div></section>';
}

function buildCareerMatchPlanReview(plan, stats, result) {
  var definition = CAREER_MATCH_PLANS[plan.id], played = !!(stats && stats.mins > 0);
  var value = played && definition.stat ? Number(stats[definition.stat]) || 0 : 0;
  var passed = played && (!definition.stat || value >= plan.goal);
  var contribution = !played ? '本场没有出战，打法未执行。' : plan.id === 'rim' ? '获得 ' + value + ' 次罚球，命中 ' + (stats.ftm || 0) + ' 球。' :
    plan.id === 'space' ? '三分 ' + (stats.threeM || 0) + '/' + value + '，为球队贡献 ' + ((stats.threeM || 0)*3) + ' 分。' :
    plan.id === 'create' ? '送出 ' + value + ' 次助攻，出现 ' + (stats.tov || 0) + ' 次失误。' : '本场 ' + (stats.pts || 0) + ' 分、' + (stats.reb || 0) + ' 篮板、' + (stats.ast || 0) + ' 助攻。';
  var teamScore = Number(result && result.scoreA) || 0, opponentScore = Number(result && result.scoreB) || 0;
  return { id:plan.id, key:plan.key, name:definition.name, played:played, passed:passed, goal:plan.goal, actual:value,
    headline:!played ? '本场轮休' : definition.stat ? (passed ? '执行达标' : '未达目标') : '按计划完成',
    summary:contribution + (definition.stat && played ? '目标 ' + plan.goal + ' ' + definition.unit + '。' : '') +
      '球队 ' + teamScore + '–' + opponentScore + (result && result.won ? ' 获胜。' : ' 落败。'),
    points:played ? Number(stats.pts)||0 : 0, teamScore:teamScore };
}

function renderCareerMatchPlanReview(review) {
  if (!review) return '';
  return '<section class="ce-plan-review"><div><small>本场打法 · ' + careerExperienceEscape(review.name) + '</small><strong>' + careerExperienceEscape(review.headline) +
    '</strong></div><p>' + careerExperienceEscape(review.summary) + '</p>' + (review.played && review.teamScore > 0 ? '<span>你的 ' + review.points + ' 分占球队得分 ' + Math.round(review.points/review.teamScore*100) + '%</span>' : '') + '</section>';
}

function pauseCareerPreparedGame() {
  if (!careerPreparedGame || careerPreparedGame.options.isPlayoff) return;
  if (typeof pauseSeasonSimulation === 'function') pauseSeasonSimulation();
  removeCareerExperienceModal('career-pregame-modal');
}

function resumeCareerPreparedGame() {
  if (!careerPreparedGame || careerPreparedGame.options.isPlayoff) return false;
  if (getCareerExperience().pending) { showCareerExperienceDecision(); return true; }
  showCareerPreparedMatchup();
  return true;
}
var careerCoachResume = null;

function resetCareerExperienceTransient() {
  careerPreparedGame = null;
  careerCoachResume = null;
  ['career-decision-modal','career-pregame-modal','career-coach-modal','career-feedback-modal','career-influence-modal'].forEach(removeCareerExperienceModal);
}

function careerExperienceEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function careerExperienceMoney(value) {
  return new Intl.NumberFormat('zh-CN', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value || 0);
}

function getCareerEconomicYear(seasonCount) {
  return getSeasonStartYear((seasonCount == null ? Number(STATE.career && STATE.career.seasonCount) || 0 : Number(seasonCount)) + 1);
}

function getCareerSalaryMarket(year) {
  year = year == null ? getCareerEconomicYear() : year;
  var dataYear = Math.max(2003, Math.min(2026, year));
  var cap = CAREER_SALARY_CAPS[dataYear];
  var minimum = CAREER_MINIMUM_SALARIES[dataYear];
  if (!minimum) minimum = CAREER_MINIMUM_SALARIES[2024].map(function(value) { return Math.round(value * cap / CAREER_SALARY_CAPS[2024]); });
  return { year:year, dataYear:dataYear, cap:cap, minimum:minimum, projected:year > 2026 };
}

function createCareerSalaryContract(options) {
  options = options || {};
  var c = STATE.career || {}, season = Number(c.seasonCount) || 0;
  var market = getCareerSalaryMarket(), draft = c.draft || {};
  var years = Math.max(1, Math.min(5, Number(c.contract) || 4));
  var salaries = [], type = 'market';
  var firstRound = draft.round === 1 || draft.type === 'lottery' || draft.type === 'first';
  var rookieYears = Math.min(4, Number(draft.contractYears) || 4);
  if (!options.renewed && firstRound && season < rookieYears) {
    type = 'rookie';
    var openingYear = getCareerEconomicYear(0);
    var scale = CAREER_ROOKIE_SCALES[openingYear] || CAREER_ROOKIE_SCALES[2026];
    var pick = Math.max(1, Math.min(scale.length, Number(draft.pick) || (draft.type === 'lottery' ? 8 : 24)));
    var row = scale[pick - 1];
    var rookiePay = [row[0], row[1], row[2], row[2] * (1 + row[3] / 100)];
    for (var i = season; i < Math.min(rookieYears, season + years); i++) salaries.push(Math.round(rookiePay[i] * 1.2));
  } else if (!options.renewed && draft.twoWay && market.year >= 2023 && season < (Number(draft.contractYears) || 1)) {
    type = 'two_way';
    for (var tw = 0; tw < years; tw++) salaries.push(Math.round(getCareerSalaryMarket(market.year + tw).minimum[0] * 0.5));
  } else {
    var ovr = Number(STATE.finalOVR) || 60;
    var maxShare = season >= 10 ? 0.35 : season >= 7 ? 0.30 : 0.25;
    var share = ovr >= 95 ? maxShare : ovr >= 90 ? 0.24 : ovr >= 85 ? 0.17 : ovr >= 80 ? 0.095 : ovr >= 75 ? 0.045 : ovr >= 68 ? 0.018 : 0;
    var minimumPay = market.minimum[Math.min(10, season)];
    var startingPay = Math.max(minimumPay, Math.round(market.cap * share));
    if (!season && !firstRound) startingPay = minimumPay;
    if (ovr >= 95 && options.previousSalary) startingPay = Math.max(startingPay, Math.round(options.previousSalary * 1.05));
    type = startingPay === minimumPay ? 'minimum' : 'market';
    var sameTeam = options.sameTeam !== false;
    var raise = market.year < 2005 ? (sameTeam ? 0.125 : 0.10) : market.year < 2011 ? (sameTeam ? 0.105 : 0.08) : market.year < 2017 ? (sameTeam ? 0.075 : 0.045) : (sameTeam ? 0.08 : 0.05);
    for (var y = 0; y < years; y++) {
      var futureMinimum = getCareerSalaryMarket(market.year + y).minimum[Math.min(10, season + y)];
      salaries.push(type === 'minimum' ? futureMinimum : Math.max(futureMinimum, Math.round(startingPay * (1 + raise * y))));
    }
  }
  return { type:type, startSeason:season, salaries:salaries };
}

function estimateCareerAnnualSalary() {
  return createCareerSalaryContract().salaries[0];
}

function getCareerChoiceEffect(choice) {
  var effect = Object.assign({}, choice.effect);
  if (effect.cash) effect.cash = Math.round(effect.cash * getCareerSalaryMarket().cap / CAREER_SALARY_CAPS[2026]);
  return effect;
}

function getCareerExperience() {
  if (!STATE.career) return null;
  var c = STATE.career;
  if (!c.eventExperience) {
    c.eventExperience = {
      version:2, team:STATE.careerTeam, arcs:{ rotation:0, rival:0, recovery:0 },
      effects:[], task:null, feedback:null, recoveryDue:false,
      money:{ cash:0, earned:0, salary:0, offcourt:0, spent:0, annualSalary:0, contract:createCareerSalaryContract(),
        fromSeason:c.seasonCount || 0, fromGame:(STATE.season && STATE.season.games || []).length, entries:[] },
      season:{ number:-1 }, coaches:{}
    };
  }
  var e = c.eventExperience;
  if (e.season.number !== (c.seasonCount || 0)) {
    e.matchPlan = null;
    e.season = { number:c.seasonCount || 0, settled:{}, receipts:{}, salaryGames:0, business:0, coachUsed:{} };
    e.effects = [];
    e.task = null;
    e.pending = null;
    e.awaitingGameKey = null;
  }
  if (e.team !== STATE.careerTeam) {
    e.matchPlan = null;
    e.team = STATE.careerTeam;
    e.effects = [];
    e.task = null;
    e.pending = null;
    e.awaitingGameKey = null;
  }
  if (!e.money.contract || e.version < 2) {
    e.money.contract = createCareerSalaryContract();
    e.version = 2;
  }
  var contract = e.money.contract;
  var salaryIndex = Math.max(0, Math.min(contract.salaries.length - 1, (c.seasonCount || 0) - contract.startSeason));
  e.money.annualSalary = contract.salaries[salaryIndex];
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
  e.money.entries.push({ id:id, kind:kind, title:title, amount:amount, season:STATE.career.seasonCount || 0 });
  e.money.entries = e.money.entries.slice(-16);
  return true;
}

function signCareerExperienceContract(options) {
  var e = getCareerExperience();
  if (!e) return;
  var previousSalary = e.money.salary > 0 && e.money.contract.type === 'market' && (!options || !options.rookie) ? e.money.annualSalary : 0;
  e.money.contract = createCareerSalaryContract({ renewed:!options || !options.rookie, sameTeam:!options || options.sameTeam !== false, previousSalary:previousSalary });
  e.money.annualSalary = e.money.contract.salaries[0];
}

var CAREER_STATE_IMPACTS = {
  coachTrust:'影响轮换、首发竞争和续约', lockerRoomTrust:'影响球队进攻、首发竞争和续约',
  leadership:'影响球队攻防和首发竞争', loyalty:'影响球队去留和续约',
  fame:'影响全明星评选和自由市场热度', mediaTrust:'影响比赛状态和奖项评选',
  controversy:'影响状态稳定、球队去留和续约', fanSupport:'影响主场表现、球队去留和续约',
  businessValue:'影响续约意愿和自由市场报价数量', chinaPopularity:'影响自由市场热度',
  legacyBonus:'计入生涯历史分', staminaLoad:'影响体能负荷、球队攻防和伤病风险',
  injuryRiskBonus:'影响伤病风险', formVariance:'影响比赛状态的波动',
  moraleBonus:'影响球队攻防', mediaPressure:'影响心理压力与球队进攻', teamChemistry:'影响球队攻防与教练建议资格'
};

function careerInfluenceSigned(value, digits) {
  var rounded = Number((Number(value) || 0).toFixed(digits || 0));
  return (rounded > 0 ? '+' : '') + rounded;
}

function renderCareerInfluenceEffects() {
  var fx = getCareerProfileEffects();
  return '<div class="ce-influence-effects"><span>轮换倾向 <b>' + careerInfluenceSigned((Math.sqrt(fx.minutesFactor)-1)*100,1) + '%</b></span>' +
    '<span>首发竞争 <b>' + (fx.lineupBonus ? careerInfluenceSigned(fx.lineupBonus) : '尚无加成') + '</b></span>' +
    '<span>续约意愿 <b>' + careerInfluenceSigned(fx.renewalChanceBonus*100,1) + ' 个百分点</b></span></div>';
}

function renderCareerRelationshipOverview() {
  var p = getCareerProfile();
  return '<div class="ce-relationship-overview"><div><strong>教练信任 ' + (Number(p.coachTrust)||0) + '</strong><span>更衣室信任 ' +
    (Number(p.lockerRoomTrust)||0) + '</span></div><button class="btn btn-secondary btn-sm" onclick="openCareerInfluencePanel()">生涯关系</button></div>';
}

function renderCareerChoiceImpact(changes) {
  var relevant = (changes || []).filter(function(change) { return /^(profile|mods)\./.test(change.key) && CAREER_STATE_IMPACTS[change.key.split('.').pop()]; });
  if (!relevant.length) return '';
  var descriptions = relevant.map(function(change) { return change.label + '：' + CAREER_STATE_IMPACTS[change.key.split('.').pop()]; });
  var teamChange = relevant.some(function(change) { return /profile\.(coachTrust|lockerRoomTrust|leadership|loyalty|businessValue|controversy|fanSupport)$/.test(change.key); });
  return '<div class="ce-choice-impact"><p>' + descriptions.map(careerExperienceEscape).join('<br>') + '</p>' + (teamChange ? renderCareerInfluenceEffects() : '') +
    '<button class="btn btn-secondary btn-sm" onclick="openCareerInfluencePanel(\'' + relevant[0].key.split('.').pop() + '\')">查看生涯关系</button></div>';
}

function openCareerInfluencePanel(focusKey) {
  if (!STATE.career) return;
  if (STATE.careerTeam && STATE.season && !STATE.season.isPlayoffs && typeof pauseSeasonSimulation === 'function') pauseSeasonSimulation();
  var p = getCareerProfile(), fx = getCareerProfileEffects(), mods = getNextSeasonMods();
  var groups = [
    { title:'球队关系', keys:['coachTrust','lockerRoomTrust','leadership','loyalty'], footer:renderCareerInfluenceEffects() },
    { title:'公众形象', keys:['fame','mediaTrust','fanSupport','controversy'], footer:'' },
    { title:'场外机会', keys:['businessValue','chinaPopularity'], footer:'<p class="ce-influence-total">自由市场报价 ' + careerInfluenceSigned(fx.contractOfferBonus) + ' 份</p>' },
    { title:'生涯声望', keys:['legacyBonus'], footer:'<p class="ce-influence-total">历史评分 ' + careerInfluenceSigned(fx.legacyScoreContribution) + '</p>' },
    { title:'本季状态', keys:['staminaLoad','injuryRiskBonus','formVariance','moraleBonus','mediaPressure','teamChemistry'], values:mods, footer:'' }
  ];
  var focused = groups.findIndex(function(group) { return group.keys.indexOf(focusKey) >= 0; });
  var body = groups.map(function(group,index) {
    return '<details class="ce-influence-group"' + (index === Math.max(0,focused) ? ' open' : '') + '><summary>' + group.title + '</summary><div class="ce-influence-values">' +
      group.keys.map(function(key) {
        var value = Number((group.values || p)[key]) || 0;
        var tone = typeof getEventAttributeTone === 'function' ? getEventAttributeTone(key, value) : 'neutral';
        return '<div data-status-key="' + key + '"><span>' + EVENT_ATTRIBUTE_LABELS[key] + '</span><strong class="is-' + tone + '">' +
          value + '</strong><small>' + CAREER_STATE_IMPACTS[key] + '</small></div>'; }).join('') + '</div>' + group.footer + '</details>';
  }).join('');
  body += '<button class="btn btn-secondary" onclick="closeCareerInfluencePanel()">返回</button>';
  showCareerExperienceModal('career-influence-modal','生涯关系',body);
}

function closeCareerInfluencePanel() {
  removeCareerExperienceModal('career-influence-modal');
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
  showCareerExperienceModal('career-coach-modal', '制服组 · 主教练人选', renderCareerRelationshipOverview() + '<p>' + careerExperienceEscape(authority.reason) +
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
    var effect = getCareerChoiceEffect(choice);
    var affordable = e.money.cash + (effect.cash || 0) >= 0;
    return '<button class="ce-choice" onclick="chooseCareerExperienceDecision(' + index + ')"' + (affordable ? '' : ' disabled') +
      '><strong>' + careerExperienceEscape(choice.label) + '</strong><span>' +
      careerExperienceEscape(careerExperienceEffectText(effect)) + '</span>' +
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
  var choice = def.choices[index], fx = getCareerChoiceEffect(choice);
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
  if (options.isPlayoff && e.matchPlan && e.matchPlan.key === key && CAREER_MATCH_PLANS[e.matchPlan.id]) {
    e.lastMatchPlanReview = buildCareerMatchPlanReview(e.matchPlan,stats,result);
    if (result) result.careerMatchPlanReview = e.lastMatchPlanReview;
    e.matchPlan = null;
  }
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
      e.feedback = { title:task.title, text:task.title + '结束：出战 ' + task.played + ' 场，场均 ' + (task.played ? (task.minutes/task.played).toFixed(1) : '0') +
        ' 分钟、' + (task.played ? (task.points/task.played).toFixed(1) : '0') + ' 分。' + criterion + '，' + task.successful + '/' + task.total + ' 场达标。' };
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
  var playoff = pregame && !!((careerPreparedGame && careerPreparedGame.options.isPlayoff) || (STATE.season && STATE.season.isPlayoffs));
  var selectedPlan = CAREER_MATCH_PLANS[(e.matchPlan || {}).id] || CAREER_MATCH_PLANS.balanced;
  var fx = getCareerExperienceModifiers(), mods = getNextSeasonMods(), ev = STATE.season && STATE.season.events || {};
  var load = (Number(mods.staminaLoad) || 0) + fx.load;
  var body = ev.injuryGamesLeft > 0 ? '休战 ' + ev.injuryGamesLeft + ' 场' : fx.limit < 42 ? '限时 ' + fx.limit + ' 分钟' : load >= 2 ? '额外负荷' : load < 0 ? '恢复安排' : '状态正常';
  var role = getCareerExperienceRole(), chemistry = getCareerExperienceChemistry(), careerProfile = getCareerProfile();
  var planned = STATE.season && typeof getPlayerRotationPlan === 'function' ? Math.round(getPlayerRotationPlan(STATE.attrs, STATE.position, !!STATE.season.isPlayoffs)) : null;
  var risk = typeof getSeasonInjuryEventRate === 'function' ? getSeasonInjuryEventRate().toFixed(1) : '—';
  var cards = '<div class="ce-status-grid"><div><small>身体状态</small><strong>' + body + '</strong><span>负荷 ' + load + ' · 每场伤病率 ' + risk + '%</span></div>' +
    '<div><small>球队地位</small><strong>' + role + '</strong><span>' + (planned == null ? '等待轮换安排' : '轮换计划 ' + planned + ' 分钟') + '</span>' +
      '<button class="ce-relationship-link" data-status-key="coachTrust" onclick="openCareerInfluencePanel()">教练信任 ' + (Number(careerProfile.coachTrust)||0) + ' ›</button></div>' +
    '<div><small>场上默契</small><strong>' + (chemistry >= 6 ? '配合成熟' : chemistry >= 2 ? '逐渐熟悉' : '磨合中') + '</strong><span>' + chemistry + '/10</span></div>' +
    (playoff ? '<div><small>本场打法</small><strong>' + careerExperienceEscape(selectedPlan.name) + '</strong><span>' +
      (e.matchPlan && e.matchPlan.goal && selectedPlan.unit ? '目标 ' + e.matchPlan.goal + ' ' + selectedPlan.unit : '按教练安排执行') + '</span></div></div>' :
      '<div><small>账户余额</small><strong>' + careerExperienceMoney(e.money.cash) + '</strong><span>生涯收入 ' + careerExperienceMoney(e.money.earned) + '</span></div></div>');
  var effects = e.effects.map(function(item) { return '<li>' + careerExperienceEscape(careerExperienceEffectText(item)) +
    ' · 剩余 ' + item.gamesLeft + ' 场</li>'; }).join('');
  var entries = e.money.entries.filter(function(item) { return item.kind !== 'salary' && String(item.id || '').indexOf('salary:') !== 0 && item.title !== '球队合约工资'; }).slice().reverse().map(function(item) { return '<li><span>' + careerExperienceEscape(item.title) + '</span><b>' +
    (item.amount >= 0 ? '+' : '−') + careerExperienceMoney(Math.abs(item.amount)) + '</b></li>'; }).join('');
  var coach = e.coaches[STATE.careerTeam];
  var playerName = typeof getHupuDisplayName === 'function' ? getHupuDisplayName() : ((typeof HUPU_USER !== 'undefined' && HUPU_USER.nickname) || '我的球员');
  var profile = pregame ? '' : '<div class="ce-profile-stage"><img src="assets/images/ui/career-avatar-v1.webp" alt="我的球员"><div class="ce-profile-caption"><small>MY PLAYER</small><h2>' + careerExperienceEscape(playerName) + '</h2><p>' + careerExperienceEscape(STATE.position) + ' · <b>OVR ' + STATE.finalOVR + '</b></p></div></div>';
  var actions = pregame ? '' : '<nav class="ce-hub-actions" aria-label="生涯功能"><button onclick="openCareerSkillPanel(this)">球风成长<span>属性与技能</span></button><button onclick="openCareerCoachSearch()">球队与教练<span>' + careerExperienceEscape(role) + ' · 默契 ' + chemistry + '</span></button><button onclick="openCareerLedger()">场外账本<span>收入与支出</span></button></nav>';
  return '<section id="' + (pregame ? 'career-pregame-status' : 'player-state-strip') + '" class="ce-status-strip' + (pregame ? '' : ' ce-career-hub') + '">' + profile + '<div class="ce-hub-content"><div class="ce-hub-heading"><small>' + (playoff ? 'PLAYOFFS' : 'MY CAREER') + '</small><strong>' + (playoff ? '本场状态' : '赛季中心') + '</strong></div>' + cards + actions +
    '<details class="player-state-details"><summary>' + (playoff ? '轮换与体能' : '本场安排与账本') + '</summary><div class="ce-details">' +
    (e.task ? '<p>' + careerExperienceEscape(e.task.title) + ' · 剩余 ' + e.task.remaining + ' 场，已达标 ' + e.task.successful + ' 场。</p>' : '') +
    (e.feedback ? '<p>' + careerExperienceEscape(e.feedback.text) + '</p>' : '') +
    (effects ? '<ul>' + effects + '</ul>' : '') + (playoff ? '' : '<p class="ce-contract-summary">年薪 ' + careerExperienceMoney(e.money.annualSalary) + ' · 已领工资 ' + careerExperienceMoney(e.money.salary) + '</p>' +
    (entries ? '<ul class="ce-ledger">' + entries + '</ul>' : '') + '<p>' + careerExperienceEscape(coach ? '主教练：' + coach.name : '球队采用当前教练体系') +
    '</p><button class="btn btn-secondary btn-sm" onclick="openCareerCoachSearch()">寻找契合球风的教练</button>') + '</div></details></div></section>';
}

function openCareerLedger() {
  var details = document.querySelector('#player-state-strip .player-state-details');
  if (!details) return;
  details.open = true;
  details.scrollIntoView({ block:'nearest', behavior:'smooth' });
}

function showCareerExperienceModal(id, title, body) {
  removeCareerExperienceModal(id);
  document.body.insertAdjacentHTML('beforeend', '<div class="team-picker-overlay ce-overlay" id="' + id +
    '"><section class="ce-modal" role="dialog" tabindex="-1" aria-modal="true" aria-label="' + careerExperienceEscape(title) +
    '"><header><small>' + (id === 'career-pregame-modal' ? (STATE.season && STATE.season.isPlayoffs ? 'PLAYOFFS' : 'GAME DAY') : 'MY CAREER') + '</small><h2>' + careerExperienceEscape(title) + '</h2></header><div class="ce-modal-body">' + body + '</div></section></div>');
  var target = document.getElementById(id).querySelector(id === 'career-influence-modal' ? '.ce-modal' : 'button:not(:disabled)');
  if (target) target.focus({ preventScroll:true });
}

function removeCareerExperienceModal(id) {
  var modal = document.getElementById(id);
  if (modal) modal.remove();
}

function renderCareerMatchupPlayer(player, user) {
  var name = user ? (typeof getHupuDisplayName === 'function' ? getHupuDisplayName() : ((typeof HUPU_USER !== 'undefined' && HUPU_USER.nickname) || '我的球员')) : player.cname || player.name;
  var visual = user ? '<div class="ce-user-stage"><img class="ce-user-model" src="assets/images/ui/career-avatar-v1.webp" alt="我的球员"><span>MY PLAYER</span></div>' :
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
    renderCareerMatchupPlayer(player, false) + '</div>' + (ctx.options.isPlayoff ? renderCareerMatchPlanPicker() : '') + renderCareerExperienceStrip(true) +
    (e.feedback ? '<div class="ce-feedback">' + careerExperienceEscape(e.feedback.text) + '</div>' : '') +
    '<div class="ce-game-actions"><button class="btn btn-primary" onclick="runCareerPreparedGame(false)">模拟本场</button>' +
    '<button class="btn btn-secondary" onclick="runCareerPreparedGame(true)"' + (window.PP_LIVE ? '' : ' disabled') + '>观看比赛</button>' +
    (ctx.options.isPlayoff ? '' : '<button class="btn btn-secondary" onclick="pauseCareerPreparedGame()">返回赛季</button>') + '</div>';
  showCareerExperienceModal('career-pregame-modal', title, info);
}

function prepareCareerExperienceGame(opponent, options, runSkip, runWatch) {
  options = options || {};
  if (!STATE.career || !STATE.season || options.forceSkip || options.isLegendChallenge ||
      (typeof isLegendChallengeSeriesActive === 'function' && isLegendChallengeSeriesActive())) return false;
  var e = getCareerExperience(), key = getCareerExperienceMatchKey(opponent, options);
  var decision = findCareerExperienceDecision(opponent, options);
  var rival = STATE.career.flags && STATE.career.flags.storyRival;
  var preview = decision || e.feedback || e.awaitingGameKey === key || options.isPlayoff || STATE.season.pauseAfterNextGame || (STATE.season.games || []).length === 0 ||
    (rival && rival.team === opponent && e.lastPreviewKey !== key);
  if (!preview) return false;
  e.awaitingGameKey = key;
  careerPreparedGame = { opponent:opponent, options:options, key:key, runSkip:runSkip, runWatch:runWatch };
  if (options.isPlayoff) {
    if (!e.matchPlan || e.matchPlan.key !== key || !CAREER_MATCH_PLANS[e.matchPlan.id]) e.matchPlan = { id:'balanced', key:key, opponent:opponent, goal:0, status:'ready' };
    else e.matchPlan.status = 'ready';
  }
  if (decision) beginCareerExperienceDecision(decision, opponent, options);
  else showCareerPreparedMatchup();
  return true;
}

function runCareerPreparedGame(watch) {
  var ctx = careerPreparedGame;
  if (!ctx || getCareerExperience().pending) return;
  careerPreparedGame = null;
  var e = getCareerExperience();
  if (ctx.options.isPlayoff && e.matchPlan && e.matchPlan.key === ctx.key) e.matchPlan.status = 'playing';
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
  matchKey:getCareerExperienceMatchKey, settleGame:settleCareerExperienceGame,
  getMatchPlanModifiers:getCareerMatchPlanModifiers, renderMatchPlanReview:renderCareerMatchPlanReview, resumePrepared:resumeCareerPreparedGame,
  signContract:signCareerExperienceContract, renewContract:signCareerExperienceContract,
  choose:chooseCareerExperienceDecision, findDecision:findCareerExperienceDecision,
  showFeedback:showCareerExperienceFeedback, pauseForCoach:pauseCareerSimulationForCoach,
  getCoachAuthority:getCareerCoachAuthority, getCoachCandidates:getCareerCoachCandidates, hireCoach:hireCareerCoach
};
