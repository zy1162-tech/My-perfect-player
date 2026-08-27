/* Perfect Player — 开场只进主菜单，其余模块进去后再加载 */
(function () {
  'use strict';

var POOL = 'assets/data/perfect-player-pool.json?v=20260825-retirement-floor-v10';

  var GROUPS = {
    create: [
      ['assets/js/perfect-player-hupu-extensions.js?v=20260826-rating-v16', '角色扩展']
    ],
    career: [
      ['assets/js/perfect-player-skills.js?v=20260824-balance-v7', '球风技能'],
      ['assets/js/perfect-player-awards.js?v=20260823-allstar-v3', '荣誉评选'],
      ['assets/js/perfect-player-enhancements.js?v=20260826-legacy-sim-v15', '成就特效']
    ],
    story: [
      ['assets/js/perfect-player-event-library.js?v=20260825-stamina-v14', '赛季事件'],
      ['assets/js/perfect-player-story-events.js?v=20260825-stamina-v14', '生涯剧情'],
      ['assets/js/perfect-player-era-story.js?v=20260827-prologue-v3', '年代主线'],
      ['assets/js/perfect-player-legend-challenge.js?v=20260824-legend-v12', '传奇挑战'],
      ['assets/js/perfect-player-allstar.js?v=20260824-double-points-mod-v1', '全明星周末']
    ],
    live: [
    ['assets/js/perfect-player-live-court.js?v=20260824-era-positions-v7', '俯瞰球场'],
    ['assets/js/perfect-player-live-sim.js?v=20260826-simulation-v17', '文字直播']
    ]
  };

  var GATE_MSG = {
    startGame: '正在准备创建角色…',
    manualLoadGame: '正在读取生涯存档…',
    showAwardsScreen: '正在准备奖项…',
    calcSeasonAwards: '正在统计选票…',
    liveOrSkipUserPack: '正在加载球场直播…'
  };

  var loaded = {};
  var inflight = {};
  var groupWork = {};
  var groupReady = {};
  var gateCount = 0;

  function boot() {
    return window.__PP_BOOT;
  }

  function set(p, msg) {
    if (boot() && typeof boot().set === 'function') boot().set(p, msg);
  }

  function githubPagesRepo(loc) {
    loc = loc || window.location;
    var host = String(loc.hostname || '').toLowerCase();
    var suffix = '.github.io';
    if (host.length <= suffix.length || host.slice(-suffix.length) !== suffix) return null;
    var owner = host.slice(0, -suffix.length);
    var pathname = String(loc.pathname || '/');
    var parts = pathname.split('/').filter(function (part) { return !!part; });
    var firstPart = parts.length ? safeDecode(parts[0]) : '';
    // 用户站点根目录的 HTML 文件名不是项目名。
    var rootFile = parts.length === 1 && pathname.slice(-1) !== '/' && /\.html?$/i.test(firstPart);
    var repo = (!parts.length || rootFile) ? owner + '.github.io' : firstPart;
    if (!owner || !repo) return null;
    return { owner: owner, repo: repo };
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); }
    catch (e) { return value; }
  }

  function encodeAssetPath(path) {
    return path.split('/').filter(function (part) { return !!part && part !== '.'; }).map(function (part) {
      return encodeURIComponent(safeDecode(part));
    }).join('/');
  }

  function scriptCandidates(src, loc) {
    loc = loc || window.location;
    if (String(loc.protocol || '').toLowerCase() === 'file:') return [src];
    var repo = githubPagesRepo(loc);
    if (!repo) return [src];
    var splitAt = String(src).search(/[?#]/);
    var path = splitAt >= 0 ? String(src).slice(0, splitAt) : String(src);
    var suffix = splitAt >= 0 ? String(src).slice(splitAt) : '';
    var ghPath = encodeAssetPath(path);
    var repoRef = encodeURIComponent(repo.owner) + '/' + encodeURIComponent(repo.repo) + '@main/';
    // 同源文件与当前 Pages 部署天然同版；CDN 仅在同源资源失败时作为灾备，
    // 避免 @main 的边缘缓存把旧模块混入新页面。
    return [
      src,
      'https://cdn.jsdelivr.net/gh/' + repoRef + ghPath + suffix,
      'https://fastly.jsdelivr.net/gh/' + repoRef + ghPath + suffix
    ];
  }

  function candidateTimeout(src) {
    return /^https?:\/\//i.test(String(src)) ? 4500 : 9000;
  }

  function loadCandidate(src, timeoutOverride) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      var settled = false;
      var timeoutMs = Number(timeoutOverride) > 0 ? Number(timeoutOverride) : candidateTimeout(src);
      var timer = null;
      function finish(ok) {
        if (settled) return;
        settled = true;
        if (timer != null) clearTimeout(timer);
        s.onload = null;
        s.onerror = null;
        if (!ok && s.parentNode) s.parentNode.removeChild(s);
        resolve(!!ok);
      }
      s.src = src;
      s.async = true;
      s.onload = function () { finish(true); };
      s.onerror = function () { finish(false); };
      timer = setTimeout(function () { finish(false); }, timeoutMs);
      document.head.appendChild(s);
    });
  }

  function loadScript(src) {
    if (loaded[src]) return Promise.resolve(true);
    if (inflight[src]) return inflight[src];
    var candidates = scriptCandidates(src);
    var attempt = candidates.reduce(function (work, candidate) {
      return work.then(function (ok) {
        return ok ? true : loadCandidate(candidate);
      });
    }, Promise.resolve(false));
    inflight[src] = attempt.then(function (ok) {
      delete inflight[src];
      if (ok) loaded[src] = true;
      return ok;
    }, function () {
      delete inflight[src];
      return false;
    });
    return inflight[src];
  }

  function ensureGroup(name) {
    var files = GROUPS[name];
    if (!files) return Promise.resolve();
    if (groupWork[name]) return groupWork[name];
    var work;
    // 剧情模块可以调用奖项引擎，必须先完成 career 的确定顺序加载。
    var dependency = name === 'story' ? ensureGroup('career') : Promise.resolve(true);
    if (name === 'career') {
      work = dependency.then(function () {
        return files.reduce(function (p, item) {
          return p.then(function (allOk) {
            return loadScript(item[0]).then(function (ok) { return allOk && ok; });
          });
        }, Promise.resolve(true));
      });
    } else {
      work = dependency.then(function () {
        return Promise.all(files.map(function (item) { return loadScript(item[0]); })).then(function (results) {
          return results.every(function (ok) { return ok; });
        });
      });
    }
    groupWork[name] = work.then(function (ok) {
      if (!ok) throw new Error('模块组加载失败: ' + name);
      groupReady[name] = true;
      return true;
    }).catch(function (err) {
      groupReady[name] = false;
      delete groupWork[name];
      throw err;
    });
    return groupWork[name];
  }

  function namesList(names) {
    return Array.isArray(names) ? names : [names];
  }

  window.__PP_ensure = function (names) {
    return Promise.all(namesList(names).map(ensureGroup));
  };

  window.__PP_groupsReady = function (names) {
    return namesList(names).every(function (n) { return !!groupReady[n]; });
  };

  function gateEl() {
    var el = document.getElementById('pp-mod-gate');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pp-mod-gate';
    el.innerHTML = '<div id="pp-mod-gate-card"><div class="loading-balls"><span class="loading-ball"></span><span class="loading-ball"></span><span class="loading-ball"></span></div><div id="pp-mod-gate-msg">正在加载…</div></div>';
    document.body.appendChild(el);
    return el;
  }

  function showGate(msg) {
    gateCount++;
    var el = gateEl();
    var text = el.querySelector('#pp-mod-gate-msg');
    if (text) text.textContent = msg || '正在加载…';
    el.classList.add('is-on');
  }

  function hideGate() {
    gateCount = Math.max(0, gateCount - 1);
    if (gateCount > 0) return;
    var el = document.getElementById('pp-mod-gate');
    if (el) el.classList.remove('is-on');
  }

  function showLoadFailure(message) {
    var text = message || '加载失败，请检查网络后重试';
    if (typeof window.showToast === 'function') {
      try { window.showToast(text); return; } catch (e) {}
    }
    var old = document.getElementById('pp-load-failure-toast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var toast = document.createElement('div');
    toast.id = 'pp-load-failure-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    toast.style.cssText = 'position:fixed;left:50%;bottom:24px;z-index:2147483640;max-width:min(340px,88vw);transform:translateX(-50%);padding:10px 14px;border-radius:12px;background:#10223a;color:#fff;font-size:12px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.24);';
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3200);
  }

  function startBootGame() {
    if (typeof window.__PP_bootStart === 'function') {
      window.__PP_bootStart();
      return;
    }
    if (typeof renderModeSelect === 'function') renderModeSelect();
    if (typeof renderPositionSelect === 'function') renderPositionSelect();
    if (typeof initGame === 'function') initGame();
  }

  function hookFn(name, groups, skip) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig._ppDeferred) return;
    var wrapped = function () {
      var self = this;
      var args = arguments;
      // 成就等模块会再包一层；若这里再去调 window[name] 会和自己套死，按钮就像没反应。
      if (wrapped._ppInside) return orig.apply(self, args);
      if (typeof skip === 'function' && skip.apply(self, args)) {
        return orig.apply(self, args);
      }
      var run = function (useLatest) {
        var current = useLatest ? window[name] : wrapped;
        wrapped._ppInside = true;
        try {
          return (typeof current === 'function' && current !== wrapped ? current : orig).apply(self, args);
        } finally {
          wrapped._ppInside = false;
        }
      };
      if (window.__PP_groupsReady(groups)) return run(false);
      showGate(GATE_MSG[name] || '正在加载…');
      return window.__PP_ensure(groups).then(function () {
        hideGate();
        // 首次等待期间 awards/enhancements 可能已替换或包装全局函数，此时只跟进一次最新实现。
        return run(true);
      }, function () {
        hideGate();
        showLoadFailure('加载失败，点击可重试');
        return undefined;
      });
    };
    wrapped._ppDeferred = true;
    window[name] = wrapped;
  }

  function hookAll() {
    hookFn('startGame', ['create']);
    hookFn('manualLoadGame', ['create', 'career', 'story']);
    hookFn('liveOrSkipUserPack', ['live'], function (_opp, options) {
      return !!(options && options.forceSkip);
    });
    hookFn('calcSeasonAwards', ['career']);
    hookFn('showAwardsScreen', ['career']);
  }

  function openCareerFeature(feature) {
    var method = feature === 'legacy' ? 'openLegacyPanel' : 'openPanel';
    showGate(feature === 'legacy' ? '正在准备传承祭坛…' : '正在准备成就殿堂…');
    return window.__PP_ensure('career').then(function () {
      hideGate();
      if (!window.PP_FX || typeof window.PP_FX[method] !== 'function') {
        showLoadFailure('功能未完整加载，点击可重试');
        return false;
      }
      window.PP_FX[method]();
      return true;
    }, function () {
      hideGate();
      showLoadFailure('加载失败，点击可重试');
      return false;
    });
  }

  window.__PP_openCareerFeature = openCareerFeature;

  function warmPool() {
    if (window.PERFECT_PLAYER_POOL_DATA) return;
    try {
      fetch(POOL, { credentials: 'same-origin' }).catch(function () {});
    } catch (e) {}
  }

  function canRegisterServiceWorker(loc, nav) {
    loc = loc || window.location;
    nav = nav || window.navigator;
    if (!nav || !nav.serviceWorker) return false;
    var protocol = String(loc.protocol || '').toLowerCase();
    var host = String(loc.hostname || '').toLowerCase();
    var localHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    return protocol === 'https:' || (protocol === 'http:' && localHost);
  }

  function registerServiceWorker() {
    if (!canRegisterServiceWorker()) return;
    window.navigator.serviceWorker.register('sw.js?v=20260827-local-headshot-attach-v10').catch(function () {});
  }

  function idleLoad() {
    setTimeout(function () { window.__PP_ensure(['create', 'career', 'story']).catch(function () {}); }, 0);
    setTimeout(function () { window.__PP_ensure('live').catch(function () {}); }, 900);
  }

  function run() {
    set(90, '打开主菜单');
    try { startBootGame(); } catch (err) { console.error(err); }
    if (boot() && typeof boot().done === 'function') boot().done();
    hookAll();
    warmPool();
    registerServiceWorker();
    idleLoad();
    if (typeof refreshContinueActivityButton === 'function') {
      try { refreshContinueActivityButton(); } catch (e) {}
    }
  }

  window.__PP_BOOT_TEST__ = {
    githubPagesRepo: githubPagesRepo,
    scriptCandidates: scriptCandidates,
    candidateTimeout:candidateTimeout,
    loadCandidate:loadCandidate,
    canRegisterServiceWorker: canRegisterServiceWorker,
    hookFn:hookFn,
    openCareerFeature:openCareerFeature,
    groups:GROUPS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
