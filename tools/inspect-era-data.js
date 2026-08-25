/**
 * 时代模式数据与成长曲线诊断（无浏览器）。
 * 打印：
 *   1) __PP_COMPLETE_ERA_ROSTERS__ 各年代键、关键球队与巨星所在队/年龄/总评（判断名单年份是否正确）
 *   2) __PP_ERA_MODE_DATA__ 的选秀班次（draftClasses）覆盖年份与是否有球队映射
 *   3) 用发布文件里的真实成长函数，模拟 2003/2010/2016 年代真实巨星 vs 假人新秀 的 12 年 OVR 轨迹
 *
 * Usage: node tools/inspect-era-data.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERA_ROSTER_CAP = 15;

function loadGlobal(file, globalName) {
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'data', file), 'utf8');
  const m = src.match(new RegExp(globalName + '\\s*=\\s*(\\{.*\\})\\s*;?\\s*$', 's'));
  if (!m) throw new Error('无法解析 ' + file);
  return JSON.parse(m[1]);
}

function extractFunction(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', idx);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}

console.log('============================================================');
console.log('1) 时代名单（era-complete-rosters.js）实际内容');
console.log('============================================================');
const complete = loadGlobal('era-complete-rosters.js', '__PP_COMPLETE_ERA_ROSTERS__');
console.log('年代键:', Object.keys(complete).join(', '));
Object.keys(complete).forEach(function (k) {
  const teams = complete[k];
  console.log('');
  console.log('=== 年代 ' + k + '：球队数 ' + Object.keys(teams).length);
  ['GSW', 'OKC', 'CLE', 'MIA', 'LAL', 'SAS', 'DAL', 'PHI', 'BOS'].forEach(function (t) {
    const rows = teams[t] || [];
    if (!rows.length) return;
    console.log('  ' + t + ': ' + rows.slice(0, 7).map(function (r) {
      return r.nameEn + '(' + (r.age != null ? r.age : '?') + '岁/' + (r.ovr != null ? r.ovr : '?') + ')';
    }).join(' | '));
  });
  function find(n) {
    const hits = [];
    Object.keys(teams).forEach(function (t) {
      (teams[t] || []).forEach(function (r) {
        if (String(r.nameEn).toLowerCase() === String(n).toLowerCase()) hits.push(t + '/' + (r.age != null ? r.age : '?') + '岁/' + (r.ovr != null ? r.ovr : '?'));
      });
    });
    return hits.length ? hits.join(', ') : '未找到';
  }
  console.log('  -- 巨星位置: 詹姆斯[' + find('LeBron James') + '] 杜兰特[' + find('Kevin Durant') + '] 库里[' + find('Stephen Curry') + '] 韦德[' + find('Dwyane Wade') + '] 科比[' + find('Kobe Bryant') + '] 邓肯[' + find('Tim Duncan') + ']');
});

console.log('');
console.log('============================================================');
console.log('2) 时代模式选秀（era-mode-data.js 的 draftClasses）');
console.log('============================================================');
const eraData = loadGlobal('era-mode-data.js', '__PP_ERA_MODE_DATA__');
console.log('era-mode-data 顶层键:', Object.keys(eraData).join(', '));
const dcs = eraData.draftClasses || {};
const years = Object.keys(dcs).map(Number).sort(function (a, b) { return a - b; });
console.log('选秀年份共 ' + years.length + ' 个:', years.join(', '));
[2009, 2010, 2011, 2015, 2016, 2017].forEach(function (y) {
  const rows = dcs[String(y)] || [];
  console.log('');
  console.log('-- ' + y + ' 届: ' + rows.length + ' 人');
  rows.slice(0, 8).forEach(function (r) {
    console.log('    ' + (r.nameEn || r.name) + ' | team=' + (r.team || '无') + ' | pick=' + (r.pick != null ? r.pick : '?') + ' | rating=' + (r.rating != null ? r.rating : '?') + ' | potential=' + (r.potential != null ? r.potential : '?') + ' | age=' + (r.age != null ? r.age : '?'));
  });
  const withTeam = rows.filter(function (r) { return r.team; }).length;
  console.log('    该届有球队映射的人数: ' + withTeam + '/' + rows.length);
});
// 任意一届是否有 team 字段
let anyTeam = 0, totalRows = 0;
years.forEach(function (y) { (dcs[String(y)] || []).forEach(function (r) { totalRows++; if (r.team) anyTeam++; }); });
console.log('');
console.log('全部选秀行: ' + totalRows + ' 行，其中带球队映射 ' + anyTeam + ' 行');

console.log('');
console.log('============================================================');
console.log('4) 三个纪元名单核实与修正模拟（与 era-mode.js 分支同逻辑）');
console.log('============================================================');
(function () {
  // 与 era-mode.js nameKey 一致的归一化匹配（含 amar'e→amare 特殊规则），避免名字匹配失败。
  function normKey(s) {
    return String(s || '').replace(/amar['’]e/ig, 'amare').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // 直接从 era-mode.js 源码抽取修正表（与游戏完全同步，避免两处维护漂移）。
  const eraModeSrc0 = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'perfect-player-era-mode.js'), 'utf8');
  function extractVar(name) {
    const m = eraModeSrc0.match(new RegExp('var ' + name + ' = (\\[.*?\\]|\\{.*?\\});', 's'));
    if (!m) return null;
    try { return eval('(' + m[1] + ')'); } catch (e) { return null; }
  }
  const ERA2004_PATCH = extractVar('ERA_2004_ROSTER_PATCH');
  const ERA2011_PATCH = extractVar('ERA_2011_ROSTER_PATCH');
  const ERA2017_PATCH = extractVar('ERA_2017_ROSTER_PATCH');
  const ERA2004_ADD = extractVar('ERA_2004_ADDITIONS') || [];
  const ERA2011_ADD = extractVar('ERA_2011_ADDITIONS') || [];
  const ERA2017_ADD = extractVar('ERA_2017_ADDITIONS') || [];
  const ERA2004_DN = extractVar('ERA_2004_DRAFT_NIGHT');
  const ERA2011_DN = extractVar('ERA_2011_DRAFT_NIGHT');
  const ERA2017_DN = extractVar('ERA_2017_DRAFT_NIGHT');
  const ERA_ARRIVAL = extractVar('ERA_ARRIVAL_OVR') || {};
  // 与游戏 replaceWeakest 完全一致的入队逻辑：满 15 人时先裁掉现有最弱者，再加入新人。
  function addToTeam(era, team, player) {
    const roster = era[team] || (era[team] = []);
    if (roster.length >= ERA_ROSTER_CAP) {
      let weakest = 0;
      roster.forEach(function (p, idx) {
        if ((p.ovr != null ? p.ovr : 0) < (roster[weakest].ovr != null ? roster[weakest].ovr : 0)) weakest = idx;
      });
      roster.splice(weakest, 1);
    }
    roster.push(player);
  }
  function simulateEraShift(year, patchTable, additions, draftNight) {
    const era = JSON.parse(JSON.stringify(complete[String(year)] || {}));
    // 1) 全联盟 +1 岁
    Object.keys(era).forEach(function (t) {
      (era[t] || []).forEach(function (r) { if (r.age != null) r.age++; });
    });
    // 2) 真实休赛期名单修正（先裁弱者再加新人，与 replaceWeakest 一致）
    let retiredCount = 0, movedCount = 0;
    Object.keys(patchTable || {}).forEach(function (key) {
      const target = patchTable[key];
      const nk = normKey(key);
      let player = null;
      Object.keys(era).some(function (t) {
        const idx = (era[t] || []).findIndex(function (r) { return normKey(r.nameEn || r.name) === nk; });
        if (idx >= 0) {
          // 与游戏运行时一致：目标球队就是原队时保持原样，不能先移除再返回。
          if (target !== null && t === target) { player = (era[t] || [])[idx]; return true; }
          player = (era[t] || []).splice(idx, 1)[0];
          return true;
        }
        return false;
      });
      if (!player) return;
      if (target === null) { retiredCount++; return; }
      if (!era[target]) return;
      if (ERA_ARRIVAL[key] != null) player.ovr = Number(ERA_ARRIVAL[key]) || player.ovr;
      addToTeam(era, target, player);
      movedCount++;
    });
    // 2b) 缺失真实球员补充
    (additions || []).forEach(function (row) {
      if (!row || !row.team) return;
      addToTeam(era, row.team, { nameEn: row.nameEn, nameCn: row.nameCn, pos: row.pos, age: row.age, ovr: row.ovr });
    });
    // 3) 该届新秀并入开局名单（与 addDraftClass 一致：按 rating 生成总评、下限 70；
    //    选秀夜交易直接落位真实球队，避免先占位再移走误裁原队球员）
    const cls = eraData.draftClasses ? (eraData.draftClasses[String(year)] || []) : [];
    const dnNorm = {};
    Object.keys(draftNight || {}).forEach(function (k) { dnNorm[normKey(k)] = draftNight[k]; });
    const rookieByTeam = {};
    cls.forEach(function (r) { if (r.team) (rookieByTeam[r.team] = rookieByTeam[r.team] || []).push(r); });
    let draftNightRouted = 0;
    Object.keys(rookieByTeam).forEach(function (t) {
      (rookieByTeam[t] || []).forEach(function (r) {
        const dest = dnNorm[normKey(r.nameEn || r.name)];
        if (dest) draftNightRouted++;
        addToTeam(era, dest || t, Object.assign({}, r, { ovr: Math.max(70, Math.min(96, Number(r.rating) || 70)) }));
      });
    });
    return { era: era, retiredCount: retiredCount, movedCount: movedCount, draftNightRouted: draftNightRouted, draftRows: cls.length, draftMapped: cls.filter(function (r) { return r.team; }).length };
  }
  function top8(era, t) {
    return (era[t] || []).slice().sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); }).slice(0, 8).map(function (r) {
      return (r.nameEn || r.name) + '(' + (r.age != null ? r.age : '?') + '岁/' + (r.ovr != null ? r.ovr : '?') + ')';
    }).join(' | ');
  }
  function has(era, t, name) {
    const nk = normKey(name);
    return (era[t] || []).some(function (r) { return normKey(r.nameEn || r.name) === nk; });
  }

  // ============ 2003 纪元 → 2003-04 赛季 ============
  const s2003 = simulateEraShift(2003, ERA2004_PATCH, ERA2004_ADD, ERA2004_DN);
  console.log('--- 2003 纪元（基础 2K3/2002-03 → 2003-04 赛季）---');
  console.log('退役移除:', s2003.retiredCount, '人 | 转会修正:', s2003.movedCount, '人 | 补充球员:', ERA2004_ADD.length, '人 | 选秀夜修正:', s2003.draftNightRouted, '人 | 2003 届入队:', s2003.draftRows, '人');
  console.log('SAS: ' + top8(s2003.era, 'SAS') + '  ← 邓肯 27 岁、无罗宾逊');
  console.log('GSW: ' + top8(s2003.era, 'GSW') + '  ← 无阿里纳斯/贾米森/有范埃克塞尔');
  console.log('WAS: ' + top8(s2003.era, 'WAS') + '  ← 应有阿里纳斯');
  console.log('DAL: ' + top8(s2003.era, 'DAL') + '  ← 应有贾米森');
  console.log('MIN: ' + top8(s2003.era, 'MIN') + '  ← 应有斯普雷维尔/卡塞尔');
  console.log('LAL: ' + top8(s2003.era, 'LAL') + '  ← 鲨鱼 31 岁、科比 25 岁');
  console.log('关键校验: 罗宾逊已退役[' + !has(s2003.era, 'SAS', 'david robinson') + '] 阿里纳斯在奇才[' + has(s2003.era, 'WAS', 'gilbert arenas') + '] 贾米森在独行侠[' + has(s2003.era, 'DAL', 'antawn jamison') + '] 斯普雷维尔在森林狼[' + has(s2003.era, 'MIN', 'latrell sprewell') + '] 卡塞尔在森林狼[' + has(s2003.era, 'MIN', 'sam cassell') + '] 米勒在国王[' + has(s2003.era, 'SAC', 'brad miller') + '] 韦德/安东尼/波什入队[' + has(s2003.era, 'MIA', 'dwyane wade') + '/' + has(s2003.era, 'DEN', 'carmelo anthony') + '/' + has(s2003.era, 'TOR', 'chris bosh') + ']');
  console.log('');

  // ============ 2010 纪元 → 2010-11 赛季 ============
  const s2010 = simulateEraShift(2010, ERA2011_PATCH, ERA2011_ADD, ERA2011_DN);
  console.log('--- 2010 纪元（基础 2K10/2009-10 → 2010-11 赛季）---');
  console.log('转会修正:', s2010.movedCount, '人 | 退役/离队:', s2010.retiredCount, '人 | 补充球员:', ERA2011_ADD.length, '人 | 选秀夜修正:', s2010.draftNightRouted, '人 | 2010 届入队:', s2010.draftRows, '人');
  console.log('MIA: ' + top8(s2010.era, 'MIA') + '  ← 三巨头');
  console.log('NYK: ' + top8(s2010.era, 'NYK') + '  ← 应有小斯/菲尔兹/莫兹戈夫');
  console.log('CHI: ' + top8(s2010.era, 'CHI') + '  ← 应有布泽尔/科沃尔/布鲁尔');
  console.log('BOS: ' + top8(s2010.era, 'BOS') + '  ← 应有鲨鱼');
  console.log('关键校验: 詹姆斯在热火[' + has(s2010.era, 'MIA', 'lebron james') + '] 波什在热火[' + has(s2010.era, 'MIA', 'chris bosh') + '] 小斯在尼克斯[' + has(s2010.era, 'NYK', 'amare stoudemire') + '] 布泽尔在公牛[' + has(s2010.era, 'CHI', 'carlos boozer') + '] 科沃尔在公牛[' + has(s2010.era, 'CHI', 'kyle korver') + '] 坎比仍在开拓者[' + has(s2010.era, 'POR', 'marcus camby') + '] 莫罗在篮网[' + has(s2010.era, 'BKN', 'anthony morrow') + '] 麦迪在活塞[' + has(s2010.era, 'DET', 'tracy mcgrady') + '] 艾弗森已离队[' + !has(s2010.era, 'PHI', 'allen iverson') + '] 沃尔在奇才[' + has(s2010.era, 'WAS', 'john wall') + ']');
  console.log('');

  // ============ 2016 纪元 → 2016-17 赛季 ============
  const s2016 = simulateEraShift(2016, ERA2017_PATCH, ERA2017_ADD, ERA2017_DN);
  console.log('--- 2016 纪元（基础 2K16/2015-16 → 2016-17 赛季）---');
  console.log('退役移除:', s2016.retiredCount, '人 | 转会修正:', s2016.movedCount, '人 | 补充球员:', ERA2017_ADD.length, '人 | 选秀夜修正:', s2016.draftNightRouted, '人 | 2016 届入队:', s2016.draftRows, '人');
  console.log('GSW: ' + top8(s2016.era, 'GSW'));
  console.log('CHI: ' + top8(s2016.era, 'CHI') + '  ← 应有韦德/隆多');
  console.log('NYK: ' + top8(s2016.era, 'NYK') + '  ← 应有罗斯/诺阿/李');
  console.log('ATL: ' + top8(s2016.era, 'ATL') + '  ← 应有霍华德');
  console.log('MIA: ' + top8(s2016.era, 'MIA') + '  ← 韦德/邓已离队');
  console.log('关键校验: 科比不在湖人[' + !has(s2016.era, 'LAL', 'kobe bryant') + '] 杜兰特在勇士[' + has(s2016.era, 'GSW', 'kevin durant') + '] 韦德在公牛[' + has(s2016.era, 'CHI', 'dwyane wade') + '] 罗斯在尼克斯[' + has(s2016.era, 'NYK', 'derrick rose') + '] 霍华德在老鹰[' + has(s2016.era, 'ATL', 'dwight howard') + '] 加索尔在马刺[' + has(s2016.era, 'SAS', 'pau gasol') + '] 伊利亚索瓦在76人[' + has(s2016.era, 'PHI', 'ersan ilyasova') + '] 萨博尼斯在雷霆[' + has(s2016.era, 'OKC', 'domantas sabonis') + '] 泰森-钱德勒在太阳[' + has(s2016.era, 'PHX', 'tyson chandler') + '] 麦考在勇士[' + has(s2016.era, 'GSW', 'patrick mccaw') + ']');
  console.log('');

  // 静态检查：era-mode.js 修正代码与 core.js 成长修复是否就位
  const eraModeSrc = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'perfect-player-era-mode.js'), 'utf8');
  const coreSrc2 = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'perfect-player-core.js'), 'utf8');
  const srcChecks = [
    ['era-mode 共享前移函数(2003/2016 通用)', /applyEraSeasonShift/.test(eraModeSrc)],
    ['era-mode 2003 纪元前移(罗宾逊退役/阿里纳斯/贾米森转会)', /ERA_2004_ROSTER_PATCH/.test(eraModeSrc) && /'David Robinson': null/.test(eraModeSrc) && /'Gilbert Arenas': 'WAS'/.test(eraModeSrc)],
    ['era-mode 2003 选秀从 2004 届开始', /addDraftClass\(2003, 0, false, ERA_2004_DRAFT_NIGHT\)/.test(eraModeSrc) && /_eraFirstDraftYear = 2004/.test(eraModeSrc)],
    ['era-mode 2016 前移(杜兰特等转会+退役)', /ERA_2017_ROSTER_PATCH/.test(eraModeSrc) && /'Kevin Durant': 'GSW'/.test(eraModeSrc) && /'Kobe Bryant': null/.test(eraModeSrc)],
    ['era-mode 2010 前移(詹姆斯/波什→热火等)', /ERA_2011_ROSTER_PATCH/.test(eraModeSrc) && /'LeBron James': 'MIA'/.test(eraModeSrc) && /'Shaquille O\\'Neal': 'BOS'/.test(eraModeSrc)],
    ['era-mode 2004 转会表扩充(斯普雷维尔/卡塞尔/米勒等)', /'Latrell Sprewell': 'MIN'/.test(eraModeSrc) && /'Sam Cassell': 'MIN'/.test(eraModeSrc) && /'Brad Miller': 'SAC'/.test(eraModeSrc) && /'Hedo Türkoğlu': 'SAS'/.test(eraModeSrc)],
    ['era-mode 2011 转会表扩充(科沃尔/麦迪/辛里奇等)', /'Kyle Korver': 'CHI'/.test(eraModeSrc) && /'Tracy McGrady': 'DET'/.test(eraModeSrc) && /'Kirk Hinrich': 'WAS'/.test(eraModeSrc)],
    ['era-mode 2017 转会表扩充(霍华德/乔治-希尔/内内等)', /'Dwight Howard': 'ATL'/.test(eraModeSrc) && /'George Hill': 'UTA'/.test(eraModeSrc) && /'Nene Hilario': 'HOU'/.test(eraModeSrc)],
    ['era-mode 缺失球员补充机制(科沃尔/哈斯勒姆/莫罗等)', /applyEraAdditions/.test(eraModeSrc) && /'Kyle Korver', nameCn:'凯尔-科沃尔'/.test(eraModeSrc) && /'Anthony Morrow'/.test(eraModeSrc)],
    ['era-mode 选秀夜交易修正(萨博尼斯/克里斯/普林斯等)', /applyEraDraftNight/.test(eraModeSrc) && /'Domantas Sabonis': 'OKC'/.test(eraModeSrc) && /'Marquese Chriss': 'PHX'/.test(eraModeSrc)],
    ['era-mode 名单修正表按归一化名匹配(修复匹配失效 bug)', /nameKey\(p\.nameEN \|\| p\.name\) === normKey/.test(eraModeSrc)],
    ['era-mode 统一 15 人名单上限', /var ERA_ROSTER_CAP = 15/.test(eraModeSrc) && /roster\.length >= ERA_ROSTER_CAP/.test(eraModeSrc)],
    ['era-mode 原队即目标队时不误删球员', /fromTeam === target\) \{ player = roster\[idx\]; return true; \}/.test(eraModeSrc)],
    ['era-mode 选秀从 2017 届开始', /_eraFirstDraftYear = 2017/.test(eraModeSrc) && /year < firstDraftYear/.test(eraModeSrc)],
    ['era-mode 年龄偏移(2003/2016 纪元+1)', /eraAgeOffset/.test(eraModeSrc)],
    ['era-mode 截断名补全(慈世平/范埃克塞尔)', /'metta world':'慈世平'/.test(eraModeSrc) && /'nick van':'尼克-范埃克塞尔'/.test(eraModeSrc)],
    ['core 成长窗口放宽到 30 岁', /Number\(age\) > 30 \|\| peakOvr <= currentOvr/.test(coreSrc2)],
    ['core 巅峰保底只到 31 岁(衰退开启)', /primeFloor && age <= 31/.test(coreSrc2)],
    ['era-mode 未收录球员年龄成长空间', /13 - Math\.max\(0, Number\(age\) - 18\) \* 0\.85/.test(eraModeSrc)]
  ];
  srcChecks.forEach(function (c) {
    console.log((c[1] ? '  ✔ ' : '  ✘ ') + c[0]);
  });

  // ============ 6) 完整名单导出（供缺失球员交叉验证） ============
  const dumpLines = [];
  dumpLines.push('纪元名单完整导出（修正后开局名单）');
  dumpLines.push('生成时间: ' + new Date().toISOString());
  dumpLines.push('');
  [
    { label: '2003-04 赛季（2003 纪元）', era: s2003.era },
    { label: '2010-11 赛季（2010 纪元）', era: s2010.era },
    { label: '2016-17 赛季（2016 纪元）', era: s2016.era }
  ].forEach(function (block) {
    dumpLines.push('============================================================');
    dumpLines.push(block.label);
    dumpLines.push('============================================================');
    const teams = Object.keys(block.era).sort();
    teams.forEach(function (t) {
      const rows = (block.era[t] || []).slice().sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
      dumpLines.push('');
      dumpLines.push('[' + t + '] 共 ' + rows.length + ' 人' + (rows.length < 13 ? '  ← 人数偏少，可能有缺失' : ''));
      rows.forEach(function (r) {
        dumpLines.push('  ' + (r.nameEn || r.name) + ' | ' + (r.pos || '?') + ' | ' + (r.age != null ? r.age : '?') + '岁 | OVR ' + (r.ovr != null ? r.ovr : '?'));
      });
    });
  });
  const dumpPath = path.join(ROOT, 'tools', 'era-rosters-dump.txt');
  try {
    fs.writeFileSync(dumpPath, dumpLines.join('\n'), 'utf8');
    console.log('');
    console.log('完整名单已导出到: tools/era-rosters-dump.txt（' + dumpLines.length + ' 行）');
  } catch (e) {
    console.log('导出失败:', e && e.message);
  }
})();

console.log('');
console.log('============================================================');
console.log('3) 成长曲线模拟（真实函数，种子固定）');
console.log('============================================================');
// 从 core.js 抽取真实成长函数，放入 vm 沙箱运行
const vm = require('vm');
const coreSrc = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'perfect-player-core.js'), 'utf8');
const fns = ['getEraPlayerGrowthBonus', 'getEraPlayerPrimeFloor', 'getLeagueAgeDevelopmentFactor'].map(function (n) {
  return extractFunction(coreSrc, n);
});
const seedRng = (function () {
  let s = 20260825 >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
})();
const simScript = fns.join('\n') + `
function simulate(age, ovr, peak, primeStart, primeEnd, primeFloor, eraRoster, seasons) {
  seasons = seasons || 12;
  var out = [];
  var cur = ovr, a = age, s;
  for (s = 1; s <= seasons; s++) {
    var prime = (eraRoster && primeFloor > 0 && a >= primeStart && a <= primeEnd) ? primeFloor : 0;
    var ageF = getLeagueAgeDevelopmentFactor({ ovr: cur, _eraRoster: eraRoster, _primeStartAge: primeStart, _primeEndAge: primeEnd, _primeFloorOvr: primeFloor }, a, rngNext());
    var volF = (rngNext() - 0.5) * 3 * 0.6;
    var randF = (rngNext() - 0.5) * 1.5;
    var change = ageF * 0.5 + volF * 0.3 + randF * 0.2;
    change += getEraPlayerGrowthBonus({ ovr: cur, _eraRoster: eraRoster, _peakOvr: peak }, a, rngNext());
    change = Math.round(change * 2) / 2;
    var next = Math.max(70, Math.min(99, cur + change));
    if (peak) next = Math.min(peak, next);
    if (prime && a <= 31) next = Math.max(prime, next);
    cur = Math.round(next);
    a++;
    out.push(a + '岁:' + cur);
  }
  return out.join(' ');
}`;
const simCtx = vm.createContext({ Math: Math, Number: Number, rngNext: seedRng });
vm.runInContext(simScript, simCtx);

const cases = [
  { name: '2003 詹姆斯(18岁,78,峰99)', age: 18, ovr: 78, peak: 99, ps: 23, pe: 41, pf: 94, era: true },
  { name: '2003 韦德(20岁,80,峰97)', age: 20, ovr: 80, peak: 97, ps: 23, pe: 31, pf: 93, era: true },
  { name: '2003 邓肯(27岁,98,峰98)', age: 27, ovr: 98, peak: 98, ps: 22, pe: 35, pf: 93, era: true },
  { name: '2003 纳什(28岁,83,峰96,晚熟)', age: 28, ovr: 83, peak: 96, ps: 29, pe: 35, pf: 92, era: true },
  { name: '2003 缺峰值巨星(20岁,80,峰0)', age: 20, ovr: 80, peak: 0, ps: 0, pe: 0, pf: 0, era: true },
  { name: '2010 考辛斯类(26岁,90,峰90无曲线)', age: 26, ovr: 90, peak: 90, ps: 0, pe: 0, pf: 0, era: true },
  { name: '2003 假人新秀(20岁,73,峰79)', age: 20, ovr: 73, peak: 79, ps: 0, pe: 0, pf: 0, era: true },
  { name: '2010 库里(21岁,78,峰98)', age: 21, ovr: 78, peak: 98, ps: 25, pe: 36, pf: 94, era: true },
  { name: '2010 詹姆斯(25岁,97,峰99)', age: 25, ovr: 97, peak: 99, ps: 23, pe: 41, pf: 94, era: true },
  { name: '2010 假人新秀(19岁,74,峰82)', age: 19, ovr: 74, peak: 82, ps: 0, pe: 0, pf: 0, era: true },
  { name: '2016 库里(28岁,96,峰98)', age: 28, ovr: 96, peak: 98, ps: 25, pe: 36, pf: 94, era: true },
  { name: '2016 杜兰特(28岁,97,峰97)', age: 28, ovr: 97, peak: 97, ps: 22, pe: 35, pf: 94, era: true },
  { name: '2016 假人新秀(21岁,75,峰81)', age: 21, ovr: 75, peak: 81, ps: 0, pe: 0, pf: 0, era: true },
  { name: '现役 文班亚马(21岁,90,峰99,无曲线)', age: 21, ovr: 90, peak: 99, ps: 0, pe: 0, pf: 0, era: false },
  { name: '现役 假人新秀(21岁,73,峰85)', age: 21, ovr: 73, peak: 85, ps: 0, pe: 0, pf: 0, era: false }
];
cases.forEach(function (c) {
  const result = vm.runInContext(
    'simulate(' + c.age + ',' + c.ovr + ',' + c.peak + ',' + c.ps + ',' + c.pe + ',' + c.pf + ',' + c.era + ',12)',
    simCtx
  );
  console.log(c.name.padEnd(32) + ' → ' + result);
});

console.log('');
console.log('============================================================');
console.log('5) 本轮改造静态检查（招募周期/续航系统/人名/事件数）');
console.log('============================================================');
(function () {
  const read = function (p) { return fs.readFileSync(path.join(ROOT, 'assets', 'js', p), 'utf8'); };
  const modV4 = read('perfect-player-mod-v4.js');
  const core3 = read('perfect-player-core.js');
  const liveSim3 = read('perfect-player-live-sim.js');
  const eraMode3 = read('perfect-player-era-mode.js');
  const hupu3 = read('perfect-player-hupu-extensions.js');
  const lib3 = read('perfect-player-event-library.js');
  const story3 = read('perfect-player-story-events.js');
  const enhance3 = read('perfect-player-enhancements.js');
  const runtime3 = read('perfect-player-event-runtime.js');
  const checks = [
    ['招募改为每三年一次', /seasonKey - lastRecruit < 3/.test(modV4)],
    ['踢人(名单话语权)改为每三年一次', /seasonKey - lastAuthority < 3/.test(modV4)],
    ['耐力已全局改名续航(js 中无残留“耐力”)', !/耐力/.test(core3 + story3 + enhance3 + runtime3 + lib3 + hupu3)],
    ['续航赛季结算(负荷高磨损/管理好回充)', /loadNow >= 3\) staNow -= 1/.test(core3) && /loadNow <= -2\) staNow \+= 1/.test(core3)],
    ['末节/压哨续航修正已接入直播模拟', /liveStaminaAdjust/.test(liveSim3) && /pct \+= liveStaminaAdjust\(ctx, shooter\)/.test(liveSim3)],
    ['伤病率随续航加强(0.045/0.033)', /1 - stamina \* 0\.045/.test(runtime3) && /1 - stamina \* 0\.033/.test(runtime3)],
    ['时代中文名表已扩充(≥90 条)', /'draymond green':'追梦格林'/.test(eraMode3) && /'kemba walker'/.test(eraMode3)],
    ['时代名单创建后补挂头像', /attachOfficialPlayerHeadshots/.test(eraMode3)],
    ['赛季日常支持 attrs(续航选项)', /Object\.keys\(choice\.attrs \|\| \{\}\)/ .test(hupu3) && /加练变速折返跑/.test(hupu3)],
    ['事件库新增续航族(216 张卡)', /stamina: \[/.test(lib3) && /期望 216/.test(lib3) && /stair_sprint/.test(lib3)],
    ['生涯剧情新增续航选择', /每天加一组折返跑/.test(story3)],
    ['续航面板文案更新(成就特效)', /续航储备/.test(enhance3)]
  ];
  let failed = 0;
  checks.forEach(function (c) {
    if (!c[1]) failed++;
    console.log((c[1] ? '  ✔ ' : '  ✘ ') + c[0]);
  });
  console.log(failed === 0 ? '  全部通过' : '  ' + failed + ' 项未通过！');
})();


