/* Perfect Player — original era storylines using the existing season event modal. */
(function (global) {
  'use strict';

  var VERSION = 1;
  var MIN_FIRST_GAME = 8;
  var COOLDOWN_GAMES = 8;
  var MAX_PER_SEASON = 2;
  var SUPPORTED_ERAS = [2003, 2010, 2016];
  var CAREER_PROFILE_KEYS = ['fame','businessValue','mediaTrust','controversy','chinaPopularity','loyalty','leadership','coachTrust','lockerRoomTrust','fanSupport','legacyBonus'];
  var PROLOGUES = {
    2003:{ title:'📜 2003 · 传奇序章', scenes:['报纸仍在清晨定义一座城市的英雄，体育电台把每一次失误送进夜班大巴，早期论坛则开始逐帧讨论球员。'], body:'你进入的不是某位现实巨星已经写好的剧本。这个年代会从第 8 场起，用报纸、电台与早期论坛记录属于你的选择。' },
    2010:{ title:'📺 2010 · 传奇序章', scenes:['全国电视辩论、刚刚加速的社交媒体与球星联手浪潮，让每个角色决定都变成公开话题。'], body:'聚光灯会放大忠诚、野心与队友关系。第 8 场起，属于这个年代的主线将与赛季事件共用同一剧情入口。' },
    2016:{ title:'📱 2016 · 传奇序章', scenes:['移动舆论、三分革命与无限换防同时改变比赛。一次训练片段，也可能在比赛结束前传遍联盟。'], body:'你可以顺应空间潮流，也可以建立自己的赢球方式。第 8 场起，年代主线会按冷却节奏逐步出现。' }
  };

  function gameState() {
    if (typeof STATE !== 'undefined') return STATE;
    return global.STATE || null;
  }

  function currentEra() {
    var root = gameState();
    return Number(root && root.eraStart) || 0;
  }

  function ensureState(career, era) {
    var root = gameState();
    career = career || (root && root.career);
    if (!career) return null;
    era = Number(era || currentEra());
    var old = career.eraStory && typeof career.eraStory === 'object' ? career.eraStory : {};
    old.version = VERSION;
    old.era = SUPPORTED_ERAS.indexOf(era) >= 0 ? era : (Number(old.era) || era);
    old.score = Number(old.score) || 0;
    old.flags = old.flags && typeof old.flags === 'object' ? old.flags : {};
    old.history = Array.isArray(old.history) ? old.history : [];
    old.themeCooldowns = old.themeCooldowns && typeof old.themeCooldowns === 'object' ? old.themeCooldowns : {};
    old.season = old.season && typeof old.season === 'object' ? old.season : {};
    old.season.key = Number.isFinite(Number(old.season.key)) ? Number(old.season.key) : -1;
    old.season.count = Math.max(0, Number(old.season.count) || 0);
    old.season.lastGame = Number.isFinite(Number(old.season.lastGame)) ? Number(old.season.lastGame) : -999;
    old.season.scheduledIds = Array.isArray(old.season.scheduledIds) ? old.season.scheduledIds : [];
    old.prologueSeen = old.prologueSeen === true;
    old.prologueCompleted = old.prologueCompleted === true;
    old.prologueLegacySkipped = old.prologueLegacySkipped === true;
    career.eraStory = old;
    return old;
  }

  function hasCareerProgress(career, root) {
    return Number(career && career.seasonCount) > 0 ||
      !!(career && Array.isArray(career.seasons) && career.seasons.length) ||
      !!(root && root.season && Array.isArray(root.season.games) && root.season.games.length);
  }

  function prologueEvent(era, state) {
    var copy = PROLOGUES[era];
    return {
      id:'era_prologue_' + era,
      branch:'era_story_' + era,
      phase:'season',
      title:copy.title,
      scenes:copy.scenes.slice(),
      body:copy.body,
      _eraStoryPrologue:true,
      choices:[{
        id:'enter_era',
        label:'踏入这个年代',
        hint:'序章只自动出现一次；第 8 场后进入正式年代剧情。',
        prediction:'序章只自动出现一次；第 8 场后进入正式年代剧情。',
        apply:function() {
          state.prologueCompleted = true;
          return '你的传奇档已经写下序章。常规赛第 8 场后，年代主线将按至少 8 场冷却逐步出现。';
        }
      }]
    };
  }

  function showPrologueIfDue(context) {
    context = context || {};
    var root = gameState() || {};
    if (root.mode !== 'legend') return false;
    var era = Number(context.era || root.eraStart);
    if (!PROLOGUES[era]) return false;
    var career = context.career || root.career;
    var state = ensureState(career, era);
    if (!state || state.prologueSeen) return false;
    // 旧档只做兼容标记，不在读档后突然插入开场剧情。
    if (context.existingSave || hasCareerProgress(career, root)) {
      state.prologueSeen = true;
      state.prologueLegacySkipped = true;
      return false;
    }
    if (typeof global.showSeasonBranchEvent !== 'function') return false;
    state.prologueSeen = true;
    global.showSeasonBranchEvent(prologueEvent(era, state));
    return true;
  }

  function getPrologueStatus(career) {
    var root = gameState() || {};
    var state = ensureState(career || root.career, root.eraStart);
    if (!state) return null;
    return { era:state.era, seen:state.prologueSeen, completed:state.prologueCompleted, legacySkipped:state.prologueLegacySkipped };
  }

  function seasonKey(career) {
    return Number(career && career.seasonCount) || 0;
  }

  function resetSeasonIfNeeded(state, career) {
    var key = seasonKey(career);
    if (state.season.key === key) return;
    state.season = { key: key, count: 0, lastGame: -999, scheduledIds: [] };
  }

  function safeAttr(key, delta) {
    if (typeof global.addAttrDelta === 'function') global.addAttrDelta(key, delta);
  }

  function safeProfile(key, delta) {
    if (CAREER_PROFILE_KEYS.indexOf(key) < 0) return;
    if (typeof global.addProfileDelta === 'function') global.addProfileDelta(key, delta);
  }

  function safeSeasonMod(key, delta, min, max) {
    if (typeof global.addSeasonMod === 'function') {
      global.addSeasonMod(key, delta, min, max);
      return;
    }
    var root = gameState();
    var career = root && root.career;
    if (!career) return;
    career.nextSeasonMods = career.nextSeasonMods || {};
    var value = (Number(career.nextSeasonMods[key]) || 0) + delta;
    career.nextSeasonMods[key] = Math.max(min, Math.min(max, value));
  }

  function applyEffect(eventId, choiceId, effect, message) {
    var root = gameState();
    var career = root && root.career;
    var state = ensureState(career);
    if (!state) return message || '';
    effect = effect || {};
    Object.keys(effect.attr || {}).forEach(function (key) { safeAttr(key, effect.attr[key]); });
    Object.keys(effect.profile || {}).forEach(function (key) { safeProfile(key, effect.profile[key]); });
    Object.keys(effect.mod || {}).forEach(function (key) {
      var bounds = key === 'injuryRiskBonus' ? [-4, 6] : (key === 'formVariance' ? [-3, 5] : [-5, 5]);
      safeSeasonMod(key, effect.mod[key], bounds[0], bounds[1]);
    });
    if (effect.flag) state.flags[effect.flag] = true;
    var score = Number(effect.score) || 0;
    state.score += score;
    var exists = state.history.some(function (entry) { return entry && entry.eventId === eventId; });
    if (!exists) {
      var eventMeta = (EVENTS || []).filter(function (event) { return event.id === eventId; })[0] || {};
      var choiceMeta = (eventMeta.choices || []).filter(function (item) { return item.id === choiceId; })[0] || {};
      state.history.push({
        seasonNum: seasonKey(career),
        era:state.era,
        eventId: eventId,
        event:eventMeta.title || eventId,
        choiceId: choiceId,
        choice:choiceMeta.label || choiceId,
        score: score
      });
    }
    if (root && typeof global.calcOVR === 'function' && root.attrs) {
      root.finalOVR = global.calcOVR(root.attrs);
    }
    return message || '';
  }

  function choice(eventId, id, label, hint, effect, message) {
    return {
      id: id,
      label: label,
      hint: hint,
      prediction: hint,
      apply: function () { return applyEffect(eventId, id, effect, message); }
    };
  }

  var DEFINITIONS = [
    {
      id:'era_story_2003_deadline', era:2003, order:1, minGame:8, topic:'press',
      title:'2003·地方晚报的截稿前',
      scenes:['训练结束时，更衣室门口只有一台肩扛摄像机。地方晚报的记者把记事本摔开，说明天的头版还留着一块空白。'],
      body:'他问你：这支球队现在应该围绕谁说话？',
      choices:[
        ['team','把头版留给全队','默契与媒体信任小幅提升',{profile:{leadership:1,mediaTrust:1},mod:{teamChemistry:1},flag:'press_team',score:2},'你报出了三个队友的名字，让记者把他们的训练故事写进头版。<br><br>影响：球队默契+1，领袖力与媒体信任略升。'],
        ['voice','清楚说出自己的目标','关键球+1，但公众期待也会上升',{attr:{CLU:1},profile:{controversy:1},mod:{mediaPressure:1},flag:'press_ambition',score:1},'你没有借用别人的台词，只说了一句：我会对最后的结果负责。<br><br>影响：关键球+1；争议+1；媒体压力+1。']
      ]
    },
    {
      id:'era_story_2003_radio', era:2003, order:2, minGame:26, topic:'radio',
      title:'2003·客场电台热线',
      scenes:['大巴离开球馆时，当地体育台的热线还在播。主持人连续接起三个电话，都在质疑你末节的传球。'],
      body:'公关经理把座机话筒递过来：愿意直接连线吗？',
      choices:[
        ['explain','复盘那个回合','传球+1，球队默契略升',{attr:{PAS:1},mod:{teamChemistry:1},profile:{mediaTrust:1},flag:'radio_explain',score:2},'你把防守轮转一层层讲清楚，也主动承认最后一步可以做得更好。<br><br>影响：传球+1，球队默契+1。'],
        ['court','把回应留到下一场','教练信任提升，状态波动略降',{mod:{formVariance:-1},profile:{coachTrust:1},flag:'radio_silence',score:1},'你没有接话筒，而是在酒店球馆多练了半小时。<br><br>影响：教练信任+1；下赛季状态波动-1。']
      ]
    },
    {
      id:'era_story_2003_forum_tape', era:2003, order:3, minGame:50, topic:'forum',
      title:'2003·论坛里的模糊录像',
      scenes:['助教打印了几页早期篮球论坛的帖子。一段低清录像被反复转载，网友们正逐帧争论你的脚步。'],
      body:'球队愿意安排一周针对训练，你要改哪一端？',
      choices:[
        ['footwork','磨低位与终结脚步','终结+1，增加内线解法',{attr:{FIN:1},profile:{coachTrust:1},flag:'forum_footwork',score:2},'你没有回帖，只是把那段录像带进训练馆，把每一步重做了一百次。<br><br>影响：终结+1，教练信任+1。'],
        ['stance','从防守站位修正','外防+1，换防更稳定',{attr:{PDEF:1},mod:{teamChemistry:1},flag:'forum_stance',score:2},'助教用胶带在地板上贴出站位点，你从第一步横移重新学起。<br><br>影响：外防+1，球队默契+1。']
      ]
    },
    {
      id:'era_story_2010_tv_panel', era:2010, order:1, minGame:8, topic:'television',
      title:'2010·晚间电视辩论',
      scenes:['全国转播结束后，更衣室的电视还亮着。评论员把球星合作说成对个人胆量的公投。'],
      body:'记者等着你定义自己在球队中的位置。',
      choices:[
        ['connect','用球场联系队友','传球+1，默契与领袖力略升',{attr:{PAS:1},mod:{teamChemistry:1},profile:{leadership:1},flag:'tv_connector',score:2},'你说，真正的角色不写在海报排位上，而写在下一次正确传球里。<br><br>影响：传球+1，球队默契+1。'],
        ['burden','主动承担最后一投','关键球+1，聚光灯压力略升',{attr:{CLU:1},mod:{mediaPressure:1},profile:{leadership:1},flag:'tv_closer',score:1},'你对镜头说，关键时刻不需要剪辑出一个英雄，但你愿意接过责任。<br><br>影响：关键球+1，媒体压力+1。']
      ]
    },
    {
      id:'era_story_2010_viral_post', era:2010, order:2, minGame:26, topic:'social',
      title:'2010·第一次病毒式传播',
      scenes:['一个十秒的更衣室片段被上传，几小时内被加上了不同标题。那句话离开语境后，听起来像在批评队友。'],
      body:'经纪人已经拟好两种回应。',
      choices:[
        ['context','发布完整上下文','降低争议，媒体信任略升',{profile:{controversy:-1,mediaTrust:1},mod:{formVariance:-1},flag:'social_context',score:2},'你只发了完整片段和一句时间线，没有和任何账号争吵。<br><br>影响：争议下降，状态波动-1。'],
        ['rebuttal','亲自录制强硬回应','球迷关注上升，争议也会保留',{profile:{fanSupport:1,controversy:1},mod:{mediaPressure:1},flag:'social_rebuttal',score:1},'你直接对着镜头录了一遍，没用公关稿，也没回避自己的语气。<br><br>影响：球迷支持略升；争议和压力各+1。']
      ]
    },
    {
      id:'era_story_2010_role_meeting', era:2010, order:3, minGame:50, topic:'alliance',
      title:'2010·球员联盟的闭门会',
      scenes:['一场没有摄像机的晚餐上，几名核心球员聊起了下赛季的角色和去向。消息终究会流出去，但这一刻仍属于球员自己。'],
      body:'你更愿为什么发声？',
      choices:[
        ['continuity','先稳住现有阵容','忠诚与默契提升',{profile:{loyalty:1,leadership:1},mod:{teamChemistry:2},flag:'alliance_continuity',score:2},'你提议先让现有阵容得到一个完整赛季，不把每次输球都变成去留投票。<br><br>影响：球队默契+2，忠诚与领袖力略升。'],
        ['role','争取更清晰的进攻角色','持球+1，但队内压力略升',{attr:{HAN:1},mod:{teamChemistry:-1,mediaPressure:1},profile:{leadership:1},flag:'alliance_role',score:1},'你要求教练把最后五分钟的职责说清楚，即使这会让会议变得尖锐。<br><br>影响：持球+1，领袖力+1；球队默契-1，媒体压力+1。']
      ]
    },
    {
      id:'era_story_2016_spacing_lab', era:2016, order:1, minGame:8, topic:'spacing',
      title:'2016·空间实验室',
      scenes:['数据组把整个半场切成了彩色网格。他们认为，你只要把一种进攻向外或向内延伸两步，对手的防守选择就会完全不同。'],
      body:'你愿意把训练时间投到哪一端？',
      choices:[
        ['range','将射程向外拉','三分+1，适应新空间',{attr:{threePT:1},mod:{formVariance:1},flag:'spacing_range',score:2},'你从比赛点外一步开始训练，允许自己经历一段命中率波动。<br><br>影响：三分+1；下赛季状态波动+1。'],
        ['mismatch','用力量惩罚换防','力量+1，巩固错位进攻',{attr:{STR:1},profile:{coachTrust:1},flag:'spacing_mismatch',score:2},'你没有追着潮流跑，而是练习如何在小个防守者换到面前时占住位置。<br><br>影响：力量+1，教练信任+1。']
      ]
    },
    {
      id:'era_story_2016_switch_clip', era:2016, order:2, minGame:26, topic:'switching',
      title:'2016·换防片段上了热榜',
      scenes:['一段换防中的犹豫被剪成循环短视频。球迷只看到了两秒，教练组看到的却是一整套轮转规则。'],
      body:'下一场前，你要如何修正？',
      choices:[
        ['versatile','接受多位置换防课','外防+1，但体能负荷略升',{attr:{PDEF:1},mod:{staminaLoad:1,teamChemistry:1},flag:'switch_versatile',score:2},'你和不同位置的队友连续练了三组换防，把口令简化成所有人都能听懂的一个词。<br><br>影响：外防+1，默契+1，体能负荷+1。'],
        ['anchor','固定自己的防守锚点','内防+1，降低轮转混乱',{attr:{IDEF:1},mod:{formVariance:-1},flag:'switch_anchor',score:2},'你和教练组约定了清晰的收缩边界，不再为一次追镜头的补防破坏整体站位。<br><br>影响：内防+1，状态波动-1。']
      ]
    },
    {
      id:'era_story_2016_load_thread', era:2016, order:3, minGame:50, topic:'mobile_opinion',
      title:'2016·群聊里的负荷争论',
      scenes:['一张训练负荷表的截图流进球迷群聊。有人说你在保存体力，也有人说球队终于开始尊重恢复科学。'],
      body:'医疗组建议你主动说明这份计划。',
      choices:[
        ['transparent','公开恢复原则','伤病风险与媒体噪音略降',{mod:{injuryRiskBonus:-1,mediaPressure:-1},profile:{mediaTrust:1},flag:'load_transparent',score:2},'你没有公布私人数据，但把训练、恢复和出场之间的逻辑讲清楚了。<br><br>影响：伤病风险-1，媒体压力-1。'],
        ['available','不解释，以出场回应','关键球+1，但体能负荷上升',{attr:{CLU:1},mod:{staminaLoad:2,injuryRiskBonus:1},profile:{fanSupport:1},flag:'load_available',score:1},'你把手机调成静音，告诉教练下一场不要限制你的时间。<br><br>影响：关键球+1；体能负荷+2，伤病风险+1。']
      ]
    }
  ];

  var EVENTS = DEFINITIONS.map(function (def) {
    var event = {
      id:def.id,
      branch:'era_story_' + def.era,
      phase:'season',
      slot:'main',
      weight:0,
      title:def.title,
      scenes:def.scenes,
      body:def.body,
      topicId:def.topic,
      _eraStory:true,
      _eraStoryYear:def.era,
      _eraStoryOrder:def.order,
      _eraStoryMinGame:def.minGame,
      choices:[]
    };
    event.choices = def.choices.map(function (raw) {
      return choice(def.id, raw[0], raw[1], raw[2], raw[3], raw[4]);
    });
    return event;
  });

  function findDueEvent(context) {
    context = context || {};
    var stateRoot = gameState() || {};
    if (stateRoot.mode !== 'legend') return null;
    var era = Number(context.era || stateRoot.eraStart);
    if (SUPPORTED_ERAS.indexOf(era) < 0) return null;
    var career = context.career || stateRoot.career;
    var state = ensureState(career, era);
    if (!state) return null;
    resetSeasonIfNeeded(state, career);
    var gamesPlayed = Math.max(0, Number(context.gamesPlayed) || 0);
    if (gamesPlayed < MIN_FIRST_GAME || state.season.count >= MAX_PER_SEASON) return null;
    if (gamesPlayed - state.season.lastGame < COOLDOWN_GAMES) return null;
    var completed = {};
    state.history.forEach(function (entry) { if (entry && entry.eventId) completed[entry.eventId] = true; });
    state.season.scheduledIds.forEach(function (id) { completed[id] = true; });
    (career._seenSeasonEventIds || []).forEach(function (id) { completed[id] = true; });
    var available = EVENTS.filter(function (event) {
      if (event._eraStoryYear !== era || gamesPlayed < event._eraStoryMinGame || completed[event.id]) return false;
      var themeStamp = state.themeCooldowns[event.topicId];
      return !themeStamp || themeStamp.season !== state.season.key || gamesPlayed - themeStamp.game >= COOLDOWN_GAMES;
    }).sort(function (a, b) { return a._eraStoryOrder - b._eraStoryOrder; });
    if (!available.length) return null;
    var picked = available[0];
    state.season.count += 1;
    state.season.lastGame = gamesPlayed;
    state.season.scheduledIds.push(picked.id);
    state.themeCooldowns[picked.topicId] = { season:state.season.key, game:gamesPlayed };
    return picked;
  }

  function getSummary(career) {
    var root = gameState();
    var state = ensureState(career || (root && root.career));
    if (!state) return null;
    var total = EVENTS.filter(function (event) { return event._eraStoryYear === state.era; }).length;
    return {
      version:state.version,
      era:state.era,
      score:state.score,
      completed:state.history.length,
      remaining:Math.max(0, total - state.history.length),
      flags:Object.assign({}, state.flags),
      history:state.history.map(function (entry) { return Object.assign({}, entry); }),
      cooldown:{ season:state.season.key, lastGame:state.season.lastGame, count:state.season.count }
    };
  }

  if (typeof STAGED_BRANCH_EVENTS !== 'undefined' && Array.isArray(STAGED_BRANCH_EVENTS)) {
    EVENTS.forEach(function (event) {
      if (!STAGED_BRANCH_EVENTS.some(function (existing) { return existing && existing.id === event.id; })) {
        STAGED_BRANCH_EVENTS.push(event);
      }
    });
  }

  global.PP_ERA_STORY = {
    version:VERSION,
    config:{ minFirstGame:MIN_FIRST_GAME, cooldownGames:COOLDOWN_GAMES, maxPerSeason:MAX_PER_SEASON },
    events:EVENTS.slice(),
    ensureState:ensureState,
    showPrologueIfDue:showPrologueIfDue,
    getPrologueStatus:getPrologueStatus,
    findDueEvent:findDueEvent,
    getSummary:getSummary
  };
})(typeof window !== 'undefined' ? window : globalThis);
